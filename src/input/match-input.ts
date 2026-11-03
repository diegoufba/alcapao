import type { PlayerId, PlayerInput } from '../core/types';
import { deviceLabel } from '../ui/hud';
import type { DeviceSlots } from './devices';
import type { GamepadInput } from './gamepad';
import type { KeyboardInput } from './keyboard';
import type { TouchInput } from './touch';

/** O que o HUD precisa saber de cada jogador. */
export interface HudSlots {
  label(p: PlayerId): string;
  isConnected(p: PlayerId): boolean;
}

/** Entradas locais da partida, por jogador. */
export interface MatchInput extends HudSlots {
  read(): Map<PlayerId, PlayerInput>;
}

const STILL: PlayerInput = { move: { x: 0, z: 0 }, push: false };

/** Entrada por dispositivos locais (teclado, gamepads e toque). */
export function deviceInput(devices: DeviceSlots, keyboard: KeyboardInput, gamepad: GamepadInput, touch?: TouchInput): MatchInput {
  return {
    label: (p) => deviceLabel(devices.deviceOf(p)),
    isConnected: (p) => devices.isConnected(p),
    read() {
      const out = new Map<PlayerId, PlayerInput>();
      for (const id of devices.players()) {
        const d = devices.deviceOf(id);
        if (!d) continue;
        const r = d === 'touch' ? (touch?.read() ?? STILL) : d.startsWith('gp-') ? gamepad.read(d) : keyboard.read(d);
        out.set(id, { move: r.move, push: r.push });
      }
      return out;
    },
  };
}
