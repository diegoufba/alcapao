import { ARENA_HALF } from './arena';
import type { GameEvent, PlayerId, PlayerInput, PlayerState } from './types';

export const RADIUS = 0.4;
export const MAX_SPEED = 5;
export const ACCEL_TIME = 0.1;
export const PUSH_RANGE = 1.2;
export const PUSH_HALF_ANGLE = Math.PI / 4;
export const PUSH_DISTANCE = 1.5;
export const KNOCK_TIME = 0.35;
export const PUSH_FREEZE = 0.3;
export const PUSH_COOLDOWN = 2;

const BUMP_MIN_SPEED = 1;
const BUMP_INTERVAL = 0.3;
const WALL = ARENA_HALF - RADIUS;
const KNOCK_V0 = (2 * PUSH_DISTANCE) / KNOCK_TIME;

type PhysicsEvent = Extract<GameEvent, { type: 'pushed' | 'bumped' }>;

// Relógio interno (soma dos dt) e último bump por par, para limitar a taxa de eventos.
let clock = 0;
const lastBump = new Map<string, number>();

export function resetPhysicsMemory(): void {
  clock = 0;
  lastBump.clear();
}

const active = (p: PlayerState): boolean => p.inPlay && !p.fallen;
const clampWall = (v: number): number => Math.max(-WALL, Math.min(WALL, v));

export function stepPhysics(
  players: PlayerState[],
  inputs: Partial<Record<PlayerId, PlayerInput>>,
  dt: number,
  opts: { allowMove: boolean; allowPush: boolean },
): PhysicsEvent[] {
  const events: PhysicsEvent[] = [];
  clock += dt;
  const live = players.filter(active);

  // 1-2. Timers, velocidade e orientação.
  for (const p of live) {
    p.pushCooldown = Math.max(0, p.pushCooldown - dt);
    p.frozen = Math.max(0, p.frozen - dt);
    p.knockTime = Math.max(0, p.knockTime - dt);
    const raw = inputs[p.id]?.move ?? { x: 0, z: 0 };
    const mag = Math.hypot(raw.x, raw.z);
    const move = mag > 1 ? { x: raw.x / mag, z: raw.z / mag } : raw;
    const wanted = move.x !== 0 || move.z !== 0;
    const blocked = p.frozen > 0 || p.knockTime > 0 || !opts.allowMove;
    const tx = wanted && !blocked ? move.x * MAX_SPEED : 0;
    const tz = wanted && !blocked ? move.z * MAX_SPEED : 0;
    const k = Math.min(1, dt / ACCEL_TIME);
    p.vel.x += (tx - p.vel.x) * k;
    p.vel.z += (tz - p.vel.z) * k;
    if (wanted && !blocked) p.facing = Math.atan2(move.x, move.z);
  }

  // 3. Empurrões: calcula todos antes de aplicar.
  const pushes: Array<{ by: PlayerState; targets: PlayerState[] }> = [];
  if (opts.allowPush) {
    for (const p of live) {
      if (!inputs[p.id]?.push || p.pushCooldown !== 0 || p.frozen !== 0) continue;
      const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
      const targets = live.filter((o) => {
        if (o === p) return false;
        const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > PUSH_RANGE) return false;
        if (d === 0) return true;
        const cos = Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d));
        return Math.acos(cos) <= PUSH_HALF_ANGLE;
      });
      pushes.push({ by: p, targets });
    }
  }
  const knocked = new Set<PlayerState>();
  for (const { by, targets } of pushes) {
    for (const t of targets) {
      let dx = t.pos.x - by.pos.x, dz = t.pos.z - by.pos.z;
      const d = Math.hypot(dx, dz);
      if (d === 0) { dx = Math.sin(by.facing); dz = Math.cos(by.facing); } else { dx /= d; dz /= d; }
      if (!knocked.has(t)) { t.knockVel.x = 0; t.knockVel.z = 0; knocked.add(t); }
      t.knockVel.x += dx * KNOCK_V0;
      t.knockVel.z += dz * KNOCK_V0;
      t.knockTime = KNOCK_TIME;
    }
    events.push({ type: 'pushed', by: by.id, targets: targets.map((t) => t.id) });
  }
  for (const { by } of pushes) {
    by.frozen = PUSH_FREEZE;
    by.vel.x = 0;
    by.vel.z = 0;
    by.pushCooldown = PUSH_COOLDOWN;
  }

  // 4. Integração.
  for (const p of live) {
    const f = p.knockTime / KNOCK_TIME;
    p.pos.x += (p.vel.x + p.knockVel.x * f) * dt;
    p.pos.z += (p.vel.z + p.knockVel.z * f) * dt;
  }

  // 5. Colisão círculo × círculo.
  const minDist = 2 * RADIUS;
  const effVel = (p: PlayerState) => {
    const f = p.knockTime / KNOCK_TIME;
    return { x: p.vel.x + p.knockVel.x * f, z: p.vel.z + p.knockVel.z * f };
  };
  const bumpChecked = new Set<string>();
  for (let iter = 0; iter < 2; iter++) {
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        let d = Math.hypot(dx, dz);
        if (d >= minDist) continue;
        if (d === 0) { dx = 1; dz = 0; d = 1; } else { dx /= d; dz /= d; }
        const key = `${a.id}|${b.id}`;
        if (!bumpChecked.has(key)) {
          bumpChecked.add(key);
          const va = effVel(a), vb = effVel(b);
          const rel = Math.hypot(va.x - vb.x, va.z - vb.z);
          const last = lastBump.get(key);
          if (rel > BUMP_MIN_SPEED && (last === undefined || clock - last >= BUMP_INTERVAL)) {
            lastBump.set(key, clock);
            events.push({ type: 'bumped', a: a.id, b: b.id });
          }
        }
        const push = (minDist - Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z)) / 2;
        a.pos.x -= dx * push; a.pos.z -= dz * push;
        b.pos.x += dx * push; b.pos.z += dz * push;
      }
    }
  }

  // 6. Paredes.
  for (const p of live) {
    p.pos.x = clampWall(p.pos.x);
    p.pos.z = clampWall(p.pos.z);
  }
  return events;
}
