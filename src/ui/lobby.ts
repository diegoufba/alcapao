import { button, h, portrait, stage, type ScreenCtl } from './dom';
import { emitUi, KEY_DIRS, type PadEvent } from './nav';
import { createModePicker } from './mode-picker';
import type { Mode, PlayerId } from '../core/types';
import type { LobbyInfo, Rounds } from '../net/protocol';
import { PLAYER_COLORS } from '../render/scene';

const SLOTS: PlayerId[] = ['P1', 'P2', 'P3', 'P4'];
const COPIED_MS = 2000;

/** Quem vê o lobby (`you`, `host`) e o estado da sala. */
export interface LobbyParams { code: string; you: PlayerId; host: boolean; lobby: LobbyInfo }

export interface LobbyScreen extends ScreenCtl {
  /** Novo estado da sala, vindo da sessão. */
  update(l: LobbyInfo): void;
  /** Tecla (KeyboardEvent.code) → true se foi tratada. */
  key(code: string): boolean;
  /** Eventos de navegação dos gamepads do quadro. */
  pads(events: PadEvent[]): void;
}

interface LobbyDeps {
  onStart(): void;
  onOptions(mode: Mode, rounds: Rounds): void;
  /** Esc / B: o host fecha a sala, o cliente sai dela. */
  onLeave(): void;
}

export function createLobby({ onStart, onOptions, onLeave }: LobbyDeps): LobbyScreen {
  let p: LobbyParams = { code: '', you: 'P1', host: true, lobby: { players: ['P1'], mode: 'survival', rounds: 12, started: false } };
  let copiedTimer: ReturnType<typeof setTimeout> | null = null;

  const codeEl = h('span', 'room-code-value');
  const copy = button('btn', 'COPIAR LINK', () => copyLink());
  const linkLine = h('p', 'lobby-link');
  const cards = h('div', 'slots');
  const picker = createModePicker((mode, rounds) => { if (p.host) onOptions(mode, rounds); });
  const start = button('btn btn-accent', 'COMEÇAR', () => tryStart());
  const waiting = h('span', 'waiting', 'Aguardando o host…');
  const hint = h('span', 'hint');

  const { el } = stage('lobby',
    h('div', 'lobby-head', '',
      h('h1', 'title', 'SALA'),
      h('div', 'room-code', '', h('span', 'room-code-label', 'Código'), codeEl),
      copy),
    linkLine,
    cards,
    picker.el,
    h('div', 'join-foot', '', start, waiting, hint));

  const url = (): string => `${location.origin}${import.meta.env.BASE_URL}?sala=${p.code}`;

  function copyLink(): void {
    const link = url();
    const fallback = (): void => {
      if (copiedTimer !== null) clearTimeout(copiedTimer);
      copiedTimer = null;
      linkLine.replaceChildren('Copie o link: ', h('span', 'lobby-url', link));
    };
    const copied = (): void => {
      linkLine.textContent = 'Link copiado!';
      if (copiedTimer !== null) clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => { linkLine.textContent = ''; copiedTimer = null; }, COPIED_MS);
    };
    try {
      navigator.clipboard.writeText(link).then(copied, fallback);
    } catch {
      fallback(); // sem clipboard (contexto inseguro)
    }
  }

  function render(): void {
    const { players } = p.lobby;
    cards.replaceChildren(...SLOTS.map((id) => {
      const on = players.includes(id);
      const c = h('div', on ? 'slot is-joined' : 'slot');
      c.style.setProperty('--pc', on ? PLAYER_COLORS[id] : '#6B729A');
      const img = portrait(id, on ? '' : 'is-empty', on ? `Personagem ${id}` : 'Silhueta de vaga livre');
      if (on) {
        c.append(img, h('span', 'slot-title', id === p.you ? `${id} (você)` : id),
          h('span', 'slot-detail', id === 'P1' ? 'Host' : 'Online'), h('span', 'badge', 'PRONTO'));
      } else {
        c.append(img, h('span', 'slot-title is-free', 'Vaga livre'), h('span', 'slot-detail', 'Mande o link\npara chamar alguém'));
      }
      return c;
    }));
    start.hidden = !p.host;
    start.disabled = players.length < 2;
    waiting.hidden = p.host;
    hint.textContent = p.host
      ? 'Espaço, Enter ou Start começa (2 ou mais) · Esc / B fecha a sala'
      : 'Esc / B sai da sala';
  }

  function tryStart(): void {
    if (!p.host || p.lobby.players.length < 2) return;
    emitUi('confirmar');
    onStart();
  }

  const leave = (): void => { emitUi('voltar'); onLeave(); };

  return {
    el,
    show(params) {
      p = params as LobbyParams;
      codeEl.textContent = p.code;
      if (copiedTimer !== null) clearTimeout(copiedTimer);
      copiedTimer = null;
      linkLine.textContent = '';
      picker.setEditable(p.host);
      picker.showRow(p.host);
      picker.set(p.lobby.mode, p.lobby.rounds);
      render();
      el.hidden = false;
    },
    hide() { el.hidden = true; },
    update(l) {
      p = { ...p, lobby: l };
      if (!p.host) picker.set(l.mode, l.rounds); // no host, a escolha já está no picker
      render();
    },
    key(code) {
      if (code === 'Escape') { leave(); return true; }
      if (code === 'KeyC') { copyLink(); return true; }
      if (!p.host) return false;
      if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') { tryStart(); return true; }
      const dir = KEY_DIRS[code];
      if (dir) { picker.dir(dir); return true; }
      return false;
    },
    pads(events) {
      for (const e of events) {
        if (e.kind === 'back') { leave(); return; }
        if (!p.host) continue;
        if (e.kind === 'start') { tryStart(); return; }
        if (e.kind === 'up' || e.kind === 'down' || e.kind === 'left' || e.kind === 'right') picker.dir(e.kind);
      }
    },
  };
}
