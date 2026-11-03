import type { GameEvent, GameState, PlayerId, Vec2 } from '../core/types';
import type { SimFrame } from '../sim/source';

export interface SnapshotBuffer {
  /** Descarta tick <= o mais novo já recebido. */
  pushSnap(tick: number, state: GameState, themes?: string[]): void;
  pushEvents(tick: number, events: GameEvent[]): void;
  /** Avança o relógio de desenho; null até chegar o primeiro snapshot. */
  advance(realDt: number): SimFrame | null;
  /** Segundos (contados pelo `advance`) desde o último snapshot recebido; Infinity antes do primeiro. */
  age(): number;
  /** Quantos snapshots estão guardados (para teste). */
  size(): number;
}

interface Snap { tick: number; state: GameState; themes: string[] }
interface PendingEvent { tick: number; event: GameEvent }

const TICKS_PER_SECOND = 60;
const MAX_BEHIND = 30; // ticks de atraso do relógio além dos quais ele pula para o presente
const MAX_AHEAD = 6; // idem, para o relógio na frente do mais novo
const JUMP_DISTANCE = 2; // m: acima disso a posição saltou (respawn/slot), não se interpola

/** Buffer de snapshots do cliente: interpola posições com atraso fixo e libera os eventos pelo tick. */
export function createSnapshotBuffer(opts: { delayTicks?: number } = {}): SnapshotBuffer {
  const delayTicks = opts.delayTicks ?? 6;
  let snaps: Snap[] = [];
  let pending: PendingEvent[] = []; // ordenados por tick, estáveis na chegada
  let clock = 0;
  let sinceSnap = Infinity;
  let lastThemes: string[] = [];

  return {
    pushSnap(tick, state, themes) {
      const newest = snaps[snaps.length - 1];
      if (newest && tick <= newest.tick) return;
      if (themes) lastThemes = [...themes];
      if (!newest) clock = tick;
      snaps.push({ tick, state, themes: [...lastThemes] });
      // Teto: sem `advance` (aba escondida) o buffer não cresce sem limite; guarda ao menos um.
      const limite = tick - (MAX_BEHIND + delayTicks);
      let corte = 0;
      while (corte < snaps.length - 1 && snaps[corte].tick < limite) corte++;
      if (corte > 0) snaps = snaps.slice(corte);
      sinceSnap = 0;
    },

    pushEvents(tick, events) {
      for (const event of events) {
        let i = pending.length;
        while (i > 0 && pending[i - 1].tick > tick) i--;
        pending.splice(i, 0, { tick, event });
      }
    },

    advance(realDt) {
      if (snaps.length === 0) return null;
      sinceSnap += realDt;
      const newest = snaps[snaps.length - 1].tick;
      clock += realDt * TICKS_PER_SECOND;
      if (newest - clock > MAX_BEHIND || clock > newest + MAX_AHEAD) clock = newest;
      const render = clock - delayTicks;

      let ia = 0;
      while (ia + 1 < snaps.length && snaps[ia + 1].tick <= render) ia++;
      const a = snaps[ia];
      const b = snaps[ia + 1];

      const positions = new Map<PlayerId, Vec2>();
      const players = a.state.players.map((p) => {
        let pos: Vec2 = { ...p.pos };
        const q = b?.state.players.find((o) => o.id === p.id);
        if (b && q && render > a.tick) {
          if (Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z) > JUMP_DISTANCE) {
            pos = { ...q.pos };
          } else {
            const t = Math.min(1, (render - a.tick) / (b.tick - a.tick));
            pos = { x: p.pos.x + (q.pos.x - p.pos.x) * t, z: p.pos.z + (q.pos.z - p.pos.z) * t };
          }
        }
        positions.set(p.id, pos);
        return { ...p, pos: { ...pos } };
      });

      let n = 0;
      while (n < pending.length && pending[n].tick <= render) n++;
      const events = pending.slice(0, n).map((e) => e.event);
      pending = pending.slice(n);
      snaps = snaps.slice(ia);

      return { state: { ...a.state, players }, events, positions, themes: [...a.themes] };
    },

    age: () => sinceSnap,
    size: () => snaps.length,
  };
}
