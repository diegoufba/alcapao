import type { DeviceId } from '../input/keyboard';
import type { PlayerId } from '../core/types';

export type JoinAction = { type: 'menu' } | { type: 'leave'; player: PlayerId } | { type: 'none' };

interface Slots {
  slotOf(d: DeviceId): PlayerId | null;
  deviceOf(p: PlayerId): DeviceId | null;
}

/**
 * B (`back`) ou Select de um gamepad na tela de entrada.
 * - B do dispositivo de P1, ou de um pad que ainda não entrou: volta ao menu.
 * - B ou Select de outro pad já dentro: libera só a vaga dele.
 * - Select de P1 ou de pad fora: nada.
 */
export function padLeaveAction(slots: Slots, device: DeviceId, kind: 'back' | 'select'): JoinAction {
  const player = slots.slotOf(device);
  const isP1 = player !== null && slots.deviceOf('P1') === device;
  if (player !== null && !isP1) return { type: 'leave', player };
  return kind === 'back' ? { type: 'menu' } : { type: 'none' };
}
