import { button, h, portrait, stage, type ScreenCtl } from './dom';
import { emitUi, KEY_DIRS, type Dir, type PadEvent } from './nav';
import { createModePicker } from './mode-picker';
import { DeviceSlots } from '../input/devices';
import { applyPadChanges, pruneDisconnected } from '../input/connection';
import { canJoin, padLeaveAction } from './join-logic';
import { KEY_GROUPS, type DeviceId, type KeyboardInput } from '../input/keyboard';
import type { GameConfig } from '../core/game';
import type { PlayerId } from '../core/types';
import type { TouchMode } from '../input/touch-mode';
import { PLAYER_COLORS } from '../render/scene';

const SLOTS: PlayerId[] = ['P1', 'P2', 'P3', 'P4'];

function deviceInfo(d: DeviceId): { dev: string; keys: string } {
  switch (d) {
    case 'kb-wasd': return { dev: 'Teclado · WASD', keys: 'Mover: W A S D\nEmpurrar: F' };
    case 'kb-arrows': return { dev: 'Teclado · Setas', keys: 'Mover: setas\nEmpurrar: Shift direito' };
    case 'kb-ijkl': return { dev: 'Teclado · IJKL', keys: 'Mover: I J K L\nEmpurrar: O' };
    case 'touch': return { dev: 'Toque', keys: '' };
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
  touchMode: TouchMode;
  /** Gamepad está conectado agora? Usado para podar pads mantidos ao reentrar com `keep`. */
  isPadConnected(d: DeviceId): boolean;
  onStart(config: GameConfig, devices: DeviceSlots): void;
  onBack(): void;
}

/** `show({ keep: true })` mantém jogadores (jogar de novo); sem isso, começa vazio. Modo e rodadas persistem. */
export function createJoin({ keyboard, touchMode, isPadConnected, onStart, onBack }: JoinDeps): JoinScreen {
  let devices = new DeviceSlots();

  const cards = h('div', 'slots');
  const picker = createModePicker(() => {});
  const start = button('btn btn-accent', 'COMEÇAR', () => tryStart());

  const hint = h('span', 'hint', '');
  const { el } = stage('join',
    h('div', 'join-head', '', h('h1', 'title', 'QUEM VAI JOGAR?'),
      h('p', 'lead', 'Aperte qualquer tecla do seu grupo ou um botão do controle para entrar')),
    cards,
    picker.el,
    h('div', 'join-foot', '', start, hint));

  function render(): void {
    const touchOn = touchMode.isOn();
    hint.textContent = touchOn ? 'Toque em COMEÇAR' : 'P1 aperta Espaço ou Start · Esc / B volta ao menu';
    cards.replaceChildren(...SLOTS.map((id) => {
      const d = devices.deviceOf(id);
      const c = h('div', d ? 'slot is-joined' : 'slot');
      c.style.setProperty('--pc', d ? PLAYER_COLORS[id] : '#6B729A');
      const img = portrait(id, d ? '' : 'is-empty', d ? `Personagem ${id}` : 'Silhueta de vaga livre');
      if (d) {
        const info = deviceInfo(d);
        c.append(img, h('span', 'slot-title', `${id} · ${info.dev}`), h('span', 'slot-detail', info.keys), h('span', 'badge', 'PRONTO'));
      } else {
        c.append(img, h('span', 'slot-title is-free', 'Vaga livre'), 
          h('span', 'slot-detail', touchOn ? 'Só 1 jogador no celular' : 'WASD · Setas · IJKL\nou qualquer controle'));
      }
      return c;
    }));
    picker.showRow(devices.deviceOf('P1') !== null); // o anel mostra a linha que o dispositivo de P1 controla
    start.disabled = devices.players().length === 0;
  }

  function tryJoin(d: DeviceId): boolean {
    if (devices.slotOf(d)) return false;
    if (!canJoin(devices.players().length, d, touchMode.isOn())) return false;
    if (!devices.join(d)) return false;
    emitUi('entrou');
    render();
    return true;
  }

  /** No modo toque, a sala vazia ganha o P1 de toque. Com teclado ou gamepad já dentro, não mexe. */
  function joinTouchIfEmpty(): void {
    if (touchMode.isOn() && devices.players().length === 0) tryJoin('touch');
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

  /** O dispositivo de P1 muda modo e rodadas. Na entrada, bater no limite também soa (como antes da extração). */
  function p1Dir(dir: Dir): void {
    if (!picker.dir(dir) && (dir === 'left' || dir === 'right' || picker.get().mode === 'points')) emitUi('navegar');
  }

  function tryStart(): void {
    const players = devices.players();
    if (players.length === 0) return;
    emitUi('confirmar');
    const seed = Date.now();
    const { mode, rounds } = picker.get();
    const config: GameConfig = mode === 'survival' ? { mode, players, seed } : { mode, rounds, players, seed };
    onStart(config, devices);
  }

  // Modo toque ligado ou desligado com a tela aberta: refaz as vagas. Desligar não tira o P1.
  touchMode.onChange(() => {
    if (el.hidden) return;
    joinTouchIfEmpty();
    render();
  });

  return {
    el,
    show(params) {
      const keep = typeof params === 'object' && params !== null && (params as { keep?: boolean }).keep === true;
      if (!keep) devices = new DeviceSlots();
      const { mode, rounds } = picker.get();
      picker.set(mode, rounds); // anel de volta na linha do modo; modo e rodadas persistem
      if (keep) for (const e of pruneDisconnected(devices, isPadConnected)) emitUi(e);
      el.hidden = false;
      joinTouchIfEmpty();
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
