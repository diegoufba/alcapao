import type { PlayerId, Vec2 } from '../core/types';
import type { SnapshotBuffer } from '../net/snapshots';
import type { SimSource } from './source';

/** Heartbeat do input: reenvia mesmo sem mudança (5 Hz), para o host não ficar com input velho. */
const HEARTBEAT = 0.2;
const EPS = 1e-9;

/** Fonte do cliente online: desenha o que vem do buffer e manda o input local de `you` ao host. */
export function createRemoteSource(
  buffer: SnapshotBuffer,
  you: PlayerId,
  send: (move: Vec2, pushCount: number) => void,
): SimSource {
  let pushCount = 0;
  let lastMove: Vec2 | null = null;
  let lastCount = 0;
  let sinceSend = 0;

  return {
    pausable: false,
    skipPhase() {},

    advance(realDt, local) {
      const input = local.get(you);
      const move: Vec2 = input ? { x: input.move.x, z: input.move.z } : { x: 0, z: 0 };
      if (input?.push) pushCount++;
      sinceSend += realDt;

      const changed = lastMove === null || move.x !== lastMove.x || move.z !== lastMove.z || pushCount !== lastCount;
      if (changed || sinceSend >= HEARTBEAT - EPS) {
        send(move, pushCount);
        lastMove = move;
        lastCount = pushCount;
        sinceSend = 0;
      }
      return buffer.advance(realDt);
    },
  };
}
