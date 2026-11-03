import type { PlayerId, Vec2 } from '../core/types';
import type { SnapshotBuffer } from '../net/snapshots';
import type { SimSource } from './source';

/** Heartbeat do input: reenvia mesmo sem mudança (5 Hz), para o host não ficar com input velho. */
const HEARTBEAT = 0.2;
const EPS = 1e-9;

/** Contador de empurrões do cliente: só cresce, durante a conexão inteira (não zera entre partidas). */
export interface PushCounter { count: number }

/**
 * Fonte do cliente online: desenha o que vem do buffer e manda o input local de `you` ao host.
 * `counter` é da sessão e sobrevive às partidas; o padrão (novo, em 0) serve para uso avulso.
 */
export function createRemoteSource(
  buffer: SnapshotBuffer,
  you: PlayerId,
  send: (move: Vec2, pushCount: number) => void,
  counter: PushCounter = { count: 0 },
): SimSource {
  let lastMove: Vec2 | null = null;
  let lastCount = counter.count;
  let sinceSend = 0;

  return {
    pausable: false,
    skipPhase() {},

    advance(realDt, local) {
      const input = local.get(you);
      const move: Vec2 = input ? { x: input.move.x, z: input.move.z } : { x: 0, z: 0 };
      if (input?.push) counter.count++;
      sinceSend += realDt;

      const changed = lastMove === null || move.x !== lastMove.x || move.z !== lastMove.z || counter.count !== lastCount;
      if (changed || sinceSend >= HEARTBEAT - EPS) {
        send(move, counter.count);
        lastMove = move;
        lastCount = counter.count;
        sinceSend = 0;
      }
      return buffer.advance(realDt);
    },
  };
}
