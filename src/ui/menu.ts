import { AUDIO_HINT, button, fmt, h, portrait, stage, type ScreenCtl } from './dom';
import type { Nav } from './nav';
import { getRecord, type RecordKey } from '../records';
import type { StorageLike } from '../storage';

interface MenuDeps { nav: Nav; storage: StorageLike; onPlay(): void; onOnline(): void; onOptions(): void }

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Ícone de traço 24×24 na cor do texto do botão. */
function icon(size: number, paths: string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2.5');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}

const CIRCLE = 'M12 2.5a9.5 9.5 0 1 0 0 19a9.5 9.5 0 1 0 0-19z';
const GLOBE = [CIRCLE, 'M2.5 12h19', 'M12 2.5c2.8 2.6 4 6 4 9.5s-1.2 6.9-4 9.5c-2.8-2.6-4-6-4-9.5s1.2-6.9 4-9.5z'];
const HELP = [CIRCLE, 'M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.5-2.7 4', 'M12 17.6h.01'];
const SLIDERS = ['M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12', 'M16 4v4M10 10v4M18 16v4'];
const TROPHY = ['M7 4h10v5a5 5 0 0 1-10 0z', 'M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5', 'M12 14v4M8 20h8'];

/** Botão com ícone antes do texto. */
function iconButton(cls: string, text: string, paths: string[], size: number, onClick: () => void): HTMLButtonElement {
  const b = button(cls, '', onClick);
  b.append(icon(size, paths), h('span', '', text));
  return b;
}

function table(head: string[], rows: string[][]): HTMLTableElement {
  const t = h('table', 'tbl');
  t.append(h('thead', '', '', h('tr', '', '', ...head.map((x) => h('th', '', x)))));
  t.append(h('tbody', '', '', ...rows.map((r) => h('tr', '', '', ...r.map((c) => h('td', '', c))))));
  return t;
}

function howToPlay(): HTMLElement[] {
  return [
    h('section', 'col', '',
      h('h3', '', 'Como funciona'),
      h('p', '', 'A cada rodada o telão sorteia um tema e faz uma pergunta com quatro alternativas, uma em cada plataforma colorida (vermelho com triângulo, azul com losango, amarelo com círculo e verde com quadrado). Corra até a plataforma da resposta certa antes do tempo acabar. Quem estiver na errada, ou fora de qualquer plataforma, cai pelo alçapão.'),
      h('p', '', 'Use o empurrão para tirar os rivais do caminho: alcance curto, e leva 2 segundos para recarregar.'),
      h('h3', '', 'Sobrevivência'),
      h('p', '', 'Errou, caiu fora. Vence o último de pé. Se todos errarem na mesma rodada, ela é anulada. Jogando sozinho, vale quantas rodadas você aguenta.'),
      h('h3', '', 'Pontos'),
      h('p', '', 'Ninguém é eliminado: quem cai reaparece na rodada seguinte. Cada acerto vale 100, 200 ou 300 pontos, conforme a dificuldade. Empate no 1º lugar vai para a morte súbita.')),
    h('section', 'col', '',
      h('h3', '', 'Controles'),
      table(['Dispositivo', 'Mover', 'Empurrar'], [
        ['Teclado 1', 'W A S D', 'F'],
        ['Teclado 2', 'Setas', 'Shift direito'],
        ['Teclado 3', 'I J K L', 'O'],
        ['Gamepad', 'Analógico / D-pad', 'A (Xbox) / X (PS)'],
      ]),
      h('p', 'note', 'Nos menus: setas ou analógico para navegar, Enter ou A para confirmar, Esc ou B para voltar. Na entrada, P1 aperta Espaço ou Start para começar.'),
      h('p', 'warn', 'Aviso: alguns teclados não registram muitas teclas ao mesmo tempo (ghosting). Com vários jogadores no mesmo teclado, algumas combinações podem falhar. Se puder, use gamepads.')),
  ];
}

export function createMenu({ nav, storage, onPlay, onOnline, onOptions }: MenuDeps): ScreenCtl {
  let opener: HTMLElement | null = null;

  const play = button('btn btn-accent btn-big', 'JOGAR', onPlay);
  play.dataset.autofocus = '';
  const online = iconButton('btn btn-online', 'JOGAR ONLINE', GLOBE, 28, onOnline);
  const how = iconButton('btn btn-tile', 'Como jogar', HELP, 26, () => openPanel(how, howPanel));
  const opts = iconButton('btn btn-tile', 'Opções', SLIDERS, 26, onOptions);
  const recs = iconButton('btn btn-tile', 'Recordes', TROPHY, 26, () => openPanel(recs, recordsPanel));

  const mkPanel = (title: string, body: Node[]): HTMLElement => {
    const close = button('btn btn-accent', 'Fechar', closePanel);
    close.dataset.autofocus = '';
    const p = h('div', 'panel', '', h('h2', '', title), ...body, close);
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', title);
    return h('div', 'panel-wrap', '', p);
  };
  const howPanel = mkPanel('Como jogar', [h('div', 'cols', '', ...howToPlay())]);
  const recordsBody = h('div', 'records');
  const recordsPanel = mkPanel('Recordes', [recordsBody]);
  howPanel.hidden = true;
  recordsPanel.hidden = true;

  const { el, stage: st } = stage('menu',
    h('div', 'menu-chars', '', ...(['P1', 'P2', 'P3', 'P4'] as const).map((id) => portrait(id))),
    h('div', 'menu-title', '',
      h('h1', 'logo', 'ALÇAPÃO'),
      h('p', 'tagline', 'Quiz de sobrevivência para 1 a 4 jogadores')),
    h('nav', 'menu-list', '', play, online, h('div', 'menu-row', '', how, opts, recs)),
    h('p', 'hint', 'Enter / Start para escolher · Setas ou analógico para navegar'),
    h('p', 'audio-hint', AUDIO_HINT));
  (st.querySelector('nav') as HTMLElement).setAttribute('aria-label', 'Menu principal');
  el.append(howPanel, recordsPanel);

  function fillRecords(): void {
    const row = (label: string, key: RecordKey, unit: string): HTMLElement => {
      const v = getRecord(storage, key);
      return h('div', 'rec', '', h('span', 'rec-label', label), h('span', 'rec-value', v > 0 ? `${fmt(v)}${unit}` : '—'));
    };
    recordsBody.replaceChildren(
      row('Sobrevivência (solo)', 'survival', ' rodadas'),
      row('Pontos · 8 rodadas', 'points-8', ' pts'),
      row('Pontos · 12 rodadas', 'points-12', ' pts'),
      row('Pontos · 16 rodadas', 'points-16', ' pts'),
      h('p', 'note', 'Recordes valem para partidas solo e ficam salvos neste navegador.'));
  }

  function openPanel(from: HTMLElement, panel: HTMLElement): void {
    opener = from;
    if (panel === recordsPanel) fillRecords();
    panel.hidden = false;
    nav.setActive(panel, { onBack: closePanel });
  }

  function closePanel(): void {
    howPanel.hidden = true;
    recordsPanel.hidden = true;
    nav.setActive(st);
    opener?.focus();
    opener = null;
  }

  return {
    el,
    show() { howPanel.hidden = true; recordsPanel.hidden = true; el.hidden = false; nav.setActive(st); },
    hide() { el.hidden = true; },
  };
}
