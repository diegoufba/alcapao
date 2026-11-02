import { button, h, portrait, stage, type ScreenCtl } from './dom';
import { emitUi, KEY_DIRS, type Dir, type PadEvent } from './nav';
import { DeviceSlots } from '../input/devices';
import { applyPadChanges, pruneDisconnected } from '../input/connection';
import { padLeaveAction } from './join-logic';
import { KEY_GROUPS, type DeviceId, type KeyboardInput } from '../input/keyboard';
import type { GameConfig } from '../core/game';
import type { PlayerId } from '../core/types';
import { PLAYER_COLORS } from '../render/scene';

type Mode = 'survival' | 'points';
type Rounds = 8 | 12 | 16;
const ROUNDS: Rounds[] = [8, 12, 16];
const MODES: { id: Mode; label: string }[] = [{ id: 'survival', label: 'Sobrevivência' }, { id: 'points', label: 'Pontos' }];
const SLOTS: PlayerId[] = ['P1', 'P2', 'P3', 'P4'];
const HINTS: Record<Mode, string> = {
  points: 'Ninguém é eliminado. Acertos valem 100 / 200 / 300 conforme a dificuldade.',
  survival: 'Errou, caiu fora. Vence o último de pé.',
};

function deviceInfo(d: DeviceId): { dev: string; keys: string } {
  switch (d) {
    case 'kb-wasd': return { dev: 'Teclado · WASD', keys: 'Mover: W A S D\nEmpurrar: F' };
    case 'kb-arrows': return { dev: 'Teclado · Setas', keys: 'Mover: setas\nEmpurrar: Shift direito' };
    case 'kb-ijkl': return { dev: 'Teclado · IJKL', keys: 'Mover: I J K L\nEmpurrar: O' };
    default: return { dev: `Gamepad ${Number(d.slice(3)) + 1}`, keys: 'Mover: analógico\nEmpurrar: A / X' };
  }
}

export interface JoinScreen extends ScreenCtl {
  /** Tecla (KeyboardEvent.code) → true se foi tratada. */
  key(code: string): boolean;
  /** Eventos de gamepad do quadro: `joined` = botões novos (entrada), `events` = navegação. */
  pads(joined: DeviceId[], events: PadEvent[]): void;
  /** Gamepad desconectado na entrada: libera a vaga. */
  padDisconnected(d: DeviceId): void;
  devices(): DeviceSlots;
}

interface JoinDeps {
  keyboard: KeyboardInput;
  /** Gamepad está conectado agora? Usado para podar pads mantidos ao reentrar com `keep`. */
  isPadConnected(d: DeviceId): boolean;
  onStart(config: GameConfig, devices: DeviceSlots): void;
  onBack(): void;
}

/** `show({ keep: true })` mantém jogadores (jogar de novo); sem isso, começa vazio. Modo e rodadas persistem. */
export function createJoin({ keyboard, isPadConnected, onStart, onBack }: JoinDeps): JoinScreen {
  let devices = new DeviceSlots();
  let mode: Mode = 'survival';
  let rounds: Rounds = 12;
  let row: 'mode' | 'rounds' = 'mode';

  const cards = h('div', 'slots');
  const modeChips = MODES.map((m) => {
    const b = button('chip', m.label, () => { mode = m.id; row = 'mode'; emitUi('navegar'); render(); });
    return { id: m.id, b };
  });
  const roundChips = ROUNDS.map((r) => {
    const b = button('chip chip-num', String(r), () => { rounds = r; row = 'rounds'; emitUi('navegar'); render(); });
    return { r, b };
  });
  const modeGroup = h('div', 'opt-group', '', h('span', 'opt-label', 'Modo'), ...modeChips.map((c) => c.b));
  modeGroup.setAttribute('role', 'group');
  modeGroup.setAttribute('aria-label', 'Modo de jogo');
  const roundsGroup = h('div', 'opt-group', '', h('span', 'opt-label', 'Rodadas'), ...roundChips.map((c) => c.b));
  roundsGroup.setAttribute('role', 'group');
  roundsGroup.setAttribute('aria-label', 'Número de rodadas');
  const hint = h('span', 'mode-hint');
  const start = button('btn btn-accent', 'COMEÇAR', () => tryStart());

  const { el } = stage('join',
    h('div', 'join-head', '', h('h1', 'title', 'QUEM VAI JOGAR?'),
      h('p', 'lead', 'Aperte qualquer tecla do seu grupo ou um botão do controle para entrar')),
    cards,
    h('div', 'opts', '', modeGroup, roundsGroup, hint),
    h('div', 'join-foot', '', start, h('span', 'hint', 'P1 aperta Espaço ou Start · Esc / B volta ao menu')));

  function render(): void {
    cards.replaceChildren(...SLOTS.map((id) => {
      const d = devices.deviceOf(id);
      const c = h('div', d ? 'slot is-joined' : 'slot');
      c.style.setProperty('--pc', d ? PLAYER_COLORS[id] : '#6B729A');
      const img = portrait(id, d ? '' : 'is-empty', d ? `Personagem ${id}` : 'Silhueta de vaga livre');
      if (d) {
        const info = deviceInfo(d);
        c.append(img, h('span', 'slot-title', `${id} · ${info.dev}`), h('span', 'slot-detail', info.keys), h('span', 'badge', 'PRONTO'));
      } else {
        c.append(img, h('span', 'slot-title is-free', 'Vaga livre'), h('span', 'slot-detail', 'WASD · Setas · IJKL\nou qualquer controle'));
      }
      return c;
    }));
    const points = mode === 'points';
    if (!points) row = 'mode';
    for (const c of modeChips) { c.b.classList.toggle('is-on', c.id === mode); c.b.setAttribute('aria-pressed', String(c.id === mode)); }
    for (const c of roundChips) { c.b.classList.toggle('is-on', c.r === rounds); c.b.setAttribute('aria-pressed', String(c.r === rounds)); }
    roundsGroup.hidden = !points;
    const hasP1 = devices.deviceOf('P1') !== null; // o anel mostra a linha que o dispositivo de P1 controla
    modeGroup.classList.toggle('is-row', hasP1 && row === 'mode');
    roundsGroup.classList.toggle('is-row', hasP1 && row === 'rounds');
    hint.textContent = HINTS[mode];
    start.disabled = devices.players().length === 0;
  }

  function tryJoin(d: DeviceId): boolean {
    if (devices.slotOf(d)) return false;
    if (!devices.join(d)) return false;
    emitUi('entrou');
    render();
    return true;
  }

  function removePlayer(p: PlayerId): void {
    devices.leave(p);
    emitUi('saiu');
    render();
  }

  function removeLast(): void {
    const ps = devices.players();
    if (ps.length > 0) removePlayer(ps[ps.length - 1]);
  }

  function tryStart(): void {
    const players = devices.players();
    if (players.length === 0) return;
    emitUi('confirmar');
    const seed = Date.now();
    const config: GameConfig = mode === 'survival' ? { mode, players, seed } : { mode, rounds, players, seed };
    onStart(config, devices);
  }

  /** O dispositivo de P1 muda modo (linha de cima) e rodadas (linha de baixo). */
  function p1Dir(dir: Dir): void {
    if (dir === 'up' || dir === 'down') {
      if (mode === 'points') { row = dir === 'down' ? 'rounds' : 'mode'; emitUi('navegar'); render(); }
      return;
    }
    const step = dir === 'right' ? 1 : -1;
    if (row === 'mode') {
      const i = MODES.findIndex((m) => m.id === mode);
      mode = MODES[Math.min(Math.max(i + step, 0), MODES.length - 1)].id;
    } else {
      const i = ROUNDS.indexOf(rounds);
      rounds = ROUNDS[Math.min(Math.max(i + step, 0), ROUNDS.length - 1)];
    }
    emitUi('navegar');
    render();
  }

  return {
    el,
    show(params) {
      const keep = typeof params === 'object' && params !== null && (params as { keep?: boolean }).keep === true;
      if (!keep) devices = new DeviceSlots();
      row = 'mode';
      if (keep) for (const e of pruneDisconnected(devices, isPadConnected)) emitUi(e);
      el.hidden = false;
      render();
    },
    hide() { el.hidden = true; },
    devices: () => devices,
    key(code) {
      if (code === 'Escape') { emitUi('voltar'); onBack(); return true; }
      if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') { tryStart(); return true; }
      if (code === 'Backspace') { removeLast(); return true; }
      const d = keyboard.keyDown(code);
      if (!d) return false;
      if (tryJoin(d)) return true;
      if (d === devices.deviceOf('P1')) {
        const g = KEY_GROUPS.find((k) => k.id === d);
        const dir = KEY_DIRS[code];
        // só as quatro teclas de direção do próprio grupo de P1 contam (não o empurrar)
        if (g && dir && [g.up, g.down, g.left, g.right].includes(code)) p1Dir(dir);
      }
      return true;
    },
    pads(joined, events) {
      const fresh = new Set<DeviceId>();
      for (const d of joined) if (tryJoin(d)) fresh.add(d);
      const p1 = devices.deviceOf('P1');
      for (const e of events) {
        const d: DeviceId = `gp-${e.pad}`;
        if (fresh.has(d)) continue; // o botão que fez o pad entrar não conta como comando
        if (e.kind === 'back' || e.kind === 'select') {
          const a = padLeaveAction(devices, d, e.kind);
          if (a.type === 'menu') { emitUi('voltar'); onBack(); return; }
          if (a.type === 'leave') removePlayer(a.player);
        } else if (d === p1 && e.kind === 'start') { tryStart(); return; }
        else if (d === p1 && (e.kind === 'up' || e.kind === 'down' || e.kind === 'left' || e.kind === 'right')) p1Dir(e.kind);
      }
    },
    padDisconnected(d) {
      const evs = applyPadChanges(devices, { disconnected: [d], reconnected: [] }, 'join');
      for (const e of evs) emitUi(e);
      if (evs.length > 0) render();
    },
  };
}
