import type { PlayerInput } from '../core/types';
import { normalizeMove, type DeviceId } from './keyboard';

export interface PadLike {
  index: number;
  connected: boolean;
  axes: readonly number[];
  buttons: readonly { pressed: boolean }[];
}

const DEADZONE = 0.2;
const BTN_PUSH = 0;
const BTN_UP = 12;
const BTN_DOWN = 13;
const BTN_LEFT = 14;
const BTN_RIGHT = 15;

interface PadState {
  connected: boolean;
  prevAny: boolean; // algum botão apertado no poll anterior
  prevPush: boolean;
  pendingPush: boolean;
  move: { x: number; z: number };
}

/** Gamepads sem DOM: alimentado com snapshots de `navigator.getGamepads()`. */
export class GamepadInput {
  private pads = new Map<number, PadState>();

  /**
   * Atualiza o estado a partir de um snapshot.
   * - `joined`: pads conectados com borda de subida (não apertado no poll anterior, apertado agora)
   *   em QUALQUER botão, a cada vez: é só intenção de entrar; a tela de entrada decide via
   *   DeviceSlots (join é idempotente). Segurar o botão não reemite; pad que só apareceu não entra.
   *   Um pad em `reconnected` neste poll não entra também em `joined`.
   * - `disconnected`: pads conhecidos que agora vieram null ou !connected.
   * - `reconnected`: pads que voltaram depois de desconectados.
   */
  poll(pads: (PadLike | null)[]): { joined: DeviceId[]; disconnected: DeviceId[]; reconnected: DeviceId[] } {
    const joined: DeviceId[] = [];
    const disconnected: DeviceId[] = [];
    const reconnected: DeviceId[] = [];
    const seen = new Set<number>();

    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      seen.add(pad.index);
      const id: DeviceId = `gp-${pad.index}`;
      let st = this.pads.get(pad.index);
      const anyPressed = pad.buttons.some((b) => b.pressed);
      if (!st) {
        st = { connected: true, prevAny: false, prevPush: false, pendingPush: false, move: { x: 0, z: 0 } };
        this.pads.set(pad.index, st);
      } else if (!st.connected) {
        st.connected = true;
        st.prevPush = false;
        st.prevAny = false;
        reconnected.push(id);
      }
      if (anyPressed && !st.prevAny && !reconnected.includes(id)) joined.push(id);
      st.prevAny = anyPressed;
      const pushed = pad.buttons[BTN_PUSH]?.pressed ?? false;
      if (pushed && !st.prevPush) st.pendingPush = true;
      st.prevPush = pushed;
      st.move = readMove(pad);
    }

    for (const [index, st] of this.pads) {
      if (st.connected && !seen.has(index)) {
        st.connected = false;
        st.pendingPush = false;
        st.prevAny = false;
        st.move = { x: 0, z: 0 };
        disconnected.push(`gp-${index}`);
      }
    }
    return { joined, disconnected, reconnected };
  }

  /** Descarta bordas de push pendentes (chamar ao iniciar a partida, junto com KeyboardInput.reset). */
  reset(): void {
    for (const st of this.pads.values()) st.pendingPush = false;
  }

  /** Pad conhecido e conectado no último poll. */
  isConnected(id: DeviceId): boolean {
    return id.startsWith('gp-') && (this.pads.get(Number(id.slice(3)))?.connected ?? false);
  }

  read(id: DeviceId): PlayerInput {
    const idle: PlayerInput = { move: { x: 0, z: 0 }, push: false };
    if (!id.startsWith('gp-')) return idle;
    const st = this.pads.get(Number(id.slice(3)));
    if (!st || !st.connected) return idle;
    const push = st.pendingPush;
    st.pendingPush = false;
    return { move: { ...st.move }, push };
  }
}

function readMove(pad: PadLike): { x: number; z: number } {
  const ax = pad.axes[0] ?? 0;
  const az = pad.axes[1] ?? 0;
  const mag = Math.hypot(ax, az);
  if (mag > DEADZONE) {
    const k = mag > 1 ? 1 / mag : 1;
    return { x: ax * k + 0, z: az * k + 0 };
  }
  const b = (i: number) => (pad.buttons[i]?.pressed ? 1 : 0);
  return normalizeMove(b(BTN_RIGHT) - b(BTN_LEFT), b(BTN_DOWN) - b(BTN_UP));
}
