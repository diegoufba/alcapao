import type { PlayerId, PlayerInput } from '../core/types';
import { deviceLabel } from '../ui/hud';
import type { DeviceSlots } from './devices';
import type { GamepadInput } from './gamepad';
import type { KeyboardInput } from './keyboard';

/** O que o HUD precisa saber de cada jogador. */
export interface HudSlots {
  label(p: PlayerId): string;
  isConnected(p: PlayerId): boolean;
}

/** Entradas locais da partida, por jogador. */
export interface MatchInput extends HudSlots {
  read(): Map<PlayerId, PlayerInput>;
}

/** Entrada por dispositivos locais (teclado e gamepads). */
export function deviceInput(devices: DeviceSlots, keyboard: KeyboardInput, gamepad: GamepadInput): MatchInput {
  return {
    label: (p) => deviceLabel(devices.deviceOf(p)),
    isConnected: (p) => devices.isConnected(p),
    read() {
      const out = new Map<PlayerId, PlayerInput>();
      for (const id of devices.players()) {
        const d = devices.deviceOf(id);
        if (!d) continue;
        const r = d.startsWith('gp-') ? gamepad.read(d) : keyboard.read(d);
        out.set(id, { move: r.move, push: r.push });
      }
      return out;
    },
  };
}
