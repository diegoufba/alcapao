import { AUDIO_HINT, button, fmt, h, portrait, stage, type ScreenCtl } from './dom';
import type { Nav } from './nav';
import { getRecord, type RecordKey } from '../records';
import type { StorageLike } from '../storage';

interface MenuDeps { nav: Nav; storage: StorageLike; onPlay(): void; onOptions(): void }

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
      h('p', '', 'A cada rodada o telão sorteia um tema e faz uma pergunta com quatro alternativas, uma em cada plataforma (A, B, C e D). Corra até a plataforma da resposta certa antes do tempo acabar. Quem estiver na errada, ou fora de qualquer plataforma, cai pelo alçapão.'),
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

export function createMenu({ nav, storage, onPlay, onOptions }: MenuDeps): ScreenCtl {
  let opener: HTMLElement | null = null;

  const play = button('btn btn-accent btn-big', 'JOGAR', onPlay);
  play.dataset.autofocus = '';
  const how = button('btn btn-alt', 'Como jogar', () => openPanel(how, howPanel));
  const opts = button('btn btn-alt', 'Opções', onOptions);
  const recs = button('btn btn-alt', 'Recordes', () => openPanel(recs, recordsPanel));

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
    h('nav', 'menu-list', '', play, how, opts, recs),
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
