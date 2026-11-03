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

/**
 * Pode este dispositivo entrar? Um jogador de toque (`hasTouch`) não divide a tela: com ele na sala, ninguém
 * mais entra. O `touch` só entra com a sala vazia. Sem toque na sala, até 4.
 */
export function canJoin(players: number, device: DeviceId, hasTouch: boolean): boolean {
  if (hasTouch) return false;
  if (device === 'touch') return players === 0;
  return players < 4;
}

/**
 * O que fazer quando `device` tenta entrar. O `touch` só existe como P1 sozinho (entra com a sala vazia e
 * bloqueia o resto), então "há toque na sala" é `p1Device === 'touch'`. Teclado ou gamepad chegando nesse caso
 * trocam o P1 (notebook com tela de toque: tocou no menu, mas joga no teclado).
 */
export function joinAction(players: number, p1Device: DeviceId | null, device: DeviceId): 'join' | 'replace-p1' | 'refuse' {
  const hasTouch = p1Device === 'touch';
  if (hasTouch && players === 1 && device !== 'touch') return 'replace-p1';
  return canJoin(players, device, hasTouch) ? 'join' : 'refuse';
}
