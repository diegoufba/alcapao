import type { UiEvent } from '../audio/director';
import type { DeviceSlots } from './devices';
import type { DeviceId } from './keyboard';

export interface PadChanges {
  disconnected: readonly DeviceId[];
  reconnected: readonly DeviceId[];
}

/**
 * Aplica (des)conexões de gamepad às vagas e devolve os sons de interface a emitir.
 * - `match`: o jogador continua na partida (vaga mantida), só muda o estado de conexão; só pads com vaga contam.
 * - `join`: pad desconectado libera a vaga; reconectar não faz nada (precisa apertar um botão para entrar).
 * - outras telas: nada (a poda acontece ao reentrar na entrada, ver `pruneDisconnected`).
 */
export function applyPadChanges(slots: DeviceSlots, changes: PadChanges, screen: string): UiEvent[] {
  const out: UiEvent[] = [];
  if (screen === 'match') {
    for (const d of changes.disconnected) if (slots.slotOf(d)) { slots.setConnected(d, false); out.push('saiu'); }
    for (const d of changes.reconnected) if (slots.slotOf(d)) { slots.setConnected(d, true); out.push('entrou'); }
  } else if (screen === 'join') {
    for (const d of changes.disconnected) {
      const p = slots.slotOf(d);
      if (p) { slots.leave(p); out.push('saiu'); }
    }
  }
  return out;
}

/**
 * Ao reentrar na entrada com jogadores mantidos: remove gamepads que não estão mais conectados
 * (desconectaram durante a partida ou nos resultados) e remarca os demais como conectados.
 */
export function pruneDisconnected(slots: DeviceSlots, isPadConnected: (d: DeviceId) => boolean): UiEvent[] {
  const out: UiEvent[] = [];
  for (const p of slots.players()) {
    const d = slots.deviceOf(p)!;
    if (!d.startsWith('gp-')) continue;
    if (isPadConnected(d)) slots.setConnected(d, true);
    else { slots.leave(p); out.push('saiu'); }
  }
  return out;
}
