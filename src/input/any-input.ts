import type { PlayerId, PlayerInput } from '../core/types';
import type { GamepadInput } from './gamepad';
import { KEY_GROUPS, type KeyboardInput } from './keyboard';
import type { HudSlots, MatchInput } from './match-input';
import type { TouchInput } from './touch';

/**
 * Entrada do jogador local no online: qualquer grupo de teclado, gamepad conectado ou o toque o controla.
 * Movimento = o primeiro não nulo; empurrão = OU de todos (todos são lidos, para consumir as bordas).
 */
export function anyDeviceInput(you: PlayerId, keyboard: KeyboardInput, gamepad: GamepadInput, slots: HudSlots, touch?: TouchInput): MatchInput {
  return {
    label: (p) => slots.label(p),
    isConnected: (p) => slots.isConnected(p),
    read() {
      const reads = [...KEY_GROUPS.map((g) => keyboard.read(g.id)), ...gamepad.connectedIds().map((d) => gamepad.read(d)), ...(touch ? [touch.read()] : [])];
      const r: PlayerInput = {
        move: reads.find((x) => x.move.x !== 0 || x.move.z !== 0)?.move ?? { x: 0, z: 0 },
        push: reads.some((x) => x.push),
      };
      return new Map([[you, r]]);
    },
  };
}
