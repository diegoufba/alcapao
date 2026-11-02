import { test, expect, describe, beforeEach } from 'vitest';
import {
  stepPhysics, resetPhysicsMemory, RADIUS, PUSH_COOLDOWN,
} from '../../src/core/physics';
import type { PlayerId, PlayerInput, PlayerState } from '../../src/core/types';

const DT = 1 / 60;
const ON = { allowMove: true, allowPush: true };

function mk(id: PlayerId, x: number, z: number, facing = 0): PlayerState {
  return {
    id, pos: { x, z }, vel: { x: 0, z: 0 }, facing, inPlay: true, fallen: false,
    score: 0, pushCooldown: 0, frozen: 0, knockTime: 0, knockVel: { x: 0, z: 0 },
  };
}
const mv = (x: number, z: number, push = false): PlayerInput => ({ move: { x, z }, push });

function run(players: PlayerState[], inputs: Partial<Record<PlayerId, PlayerInput>>, seconds: number, opts = ON) {
  const events = [];
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) events.push(...stepPhysics(players, inputs, DT, opts));
  return events;
}

beforeEach(() => resetPhysicsMemory());

describe('movimento', () => {
  test('em 1 s andando para +x, pos.x entre 3,6 e 4,0 e facing ≈ π/2', () => {
    const p = mk('P1', 0, 0);
    run([p], { P1: mv(1, 0) }, 1);
    expect(p.pos.x).toBeGreaterThan(3.6);
    expect(p.pos.x).toBeLessThan(4.0);
    expect(p.facing).toBeCloseTo(Math.PI / 2, 6);
  });

  test('allowMove false: ninguém se move', () => {
    const p = mk('P1', 0, 0);
    run([p], { P1: mv(1, 1) }, 1, { allowMove: false, allowPush: true });
    expect(p.pos).toEqual({ x: 0, z: 0 });
  });

  test('bonecos fallen ou fora de jogo não se movem', () => {
    const a = mk('P1', 0, 0); a.fallen = true;
    const b = mk('P2', 2, 0); b.inPlay = false;
    run([a, b], { P1: mv(1, 0), P2: mv(1, 0) }, 1);
    expect(a.pos).toEqual({ x: 0, z: 0 });
    expect(b.pos).toEqual({ x: 2, z: 0 });
  });
});

describe('colisão e paredes', () => {
  test('sobrepostos se separam em 1 passo (>= 0,8 m)', () => {
    const a = mk('P1', 0, 0), b = mk('P2', 0.3, 0);
    stepPhysics([a, b], {}, DT, ON);
    expect(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)).toBeGreaterThanOrEqual(2 * RADIUS - 1e-9);
  });

  test('exatamente sobrepostos não geram NaN', () => {
    const a = mk('P1', 1, 1), b = mk('P2', 1, 1);
    stepPhysics([a, b], {}, DT, ON);
    expect(Number.isFinite(a.pos.x + a.pos.z + b.pos.x + b.pos.z)).toBe(true);
    expect(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)).toBeGreaterThanOrEqual(0.8 - 1e-9);
  });

  test('parede: andando 5 s para +x para em x = 5,1', () => {
    const p = mk('P1', 0, 0);
    run([p], { P1: mv(1, 0) }, 5);
    expect(p.pos.x).toBeCloseTo(5.1, 6);
  });

  test('canto: três bonecos empurrando para o canto ficam finitos e dentro de ±5,1', () => {
    const ps = [mk('P1', 5, 5), mk('P2', 4.3, 4.3), mk('P3', 4.6, 3.9)];
    const inputs = { P1: mv(1, 1), P2: mv(1, 1), P3: mv(1, 1) };
    for (let i = 0; i < 600; i++) stepPhysics(ps, inputs, DT, ON);
    for (const p of ps) {
      expect(Number.isFinite(p.pos.x) && Number.isFinite(p.pos.z)).toBe(true);
      expect(Math.abs(p.pos.x)).toBeLessThanOrEqual(5.1 + 1e-9);
      expect(Math.abs(p.pos.z)).toBeLessThanOrEqual(5.1 + 1e-9);
    }
  });

  test('bumped é emitido em impacto rápido e limitado a 1 por 0,3 s', () => {
    const a = mk('P1', -0.5, 0), b = mk('P2', 0.5, 0);
    const events = run([a, b], { P1: mv(1, 0), P2: mv(-1, 0) }, 0.25);
    const bumps = events.filter((e) => e.type === 'bumped');
    expect(bumps.length).toBe(1);
    expect(bumps[0]).toEqual({ type: 'bumped', a: 'P1', b: 'P2' });
  });

  test('contato lento (< 1 m/s) não emite bumped', () => {
    const a = mk('P1', 0, 0), b = mk('P2', 0.5, 0);
    const events = run([a, b], {}, 0.2);
    expect(events.filter((e) => e.type === 'bumped')).toEqual([]);
  });
});

describe('empurrão', () => {
  function duel(p2x: number, p2z: number) {
    return [mk('P1', 0, 0, Math.PI / 2), mk('P2', p2x, p2z)];
  }

  test('acerta à frente e desloca ≈ PUSH_DISTANCE', () => {
    const ps = duel(1, 0);
    const ev = stepPhysics(ps, { P1: mv(0, 0, true) }, DT, ON);
    expect(ev.filter((e) => e.type === 'pushed')).toEqual([{ type: 'pushed', by: 'P1', targets: ['P2'] }]);
    run(ps, {}, 0.5);
    expect(ps[1].pos.x).toBeGreaterThan(2.4);
    expect(ps[1].pos.x).toBeLessThan(2.6);
  });

  test('erra fora do cone', () => {
    const ps = duel(0, 1);
    const ev = stepPhysics(ps, { P1: mv(0, 0, true) }, DT, ON);
    expect(ev).toEqual([{ type: 'pushed', by: 'P1', targets: [] }]);
  });

  test('erra fora do alcance', () => {
    const ps = duel(1.3, 0);
    const ev = stepPhysics(ps, { P1: mv(0, 0, true) }, DT, ON);
    expect(ev).toEqual([{ type: 'pushed', by: 'P1', targets: [] }]);
  });

  test('recarga: 1 s depois não empurra, 2,01 s depois sim', () => {
    const ps = duel(10, 10);
    ps[1].inPlay = false;
    expect(stepPhysics(ps, { P1: mv(0, 0, true) }, DT, ON)).toHaveLength(1);
    run(ps, {}, 1);
    expect(stepPhysics(ps, { P1: mv(0, 0, true) }, DT, ON)).toHaveLength(0);
    run(ps, {}, PUSH_COOLDOWN + 0.01 - 1 - DT);
    expect(stepPhysics(ps, { P1: mv(0, 0, true) }, DT, ON)).toHaveLength(1);
  });

  test('quem empurra fica parado por 0,3 s', () => {
    const ps = duel(10, 10);
    ps[1].inPlay = false;
    stepPhysics(ps, { P1: mv(0, 0, true) }, DT, ON);
    run(ps, { P1: mv(1, 0) }, 0.28);
    expect(ps[0].pos).toEqual({ x: 0, z: 0 });
  });

  test('empurrão mútuo no mesmo passo: dois eventos e se afastam', () => {
    const a = mk('P1', 0, 0, Math.PI / 2), b = mk('P2', 1, 0, -Math.PI / 2);
    const ev = stepPhysics([a, b], { P1: mv(0, 0, true), P2: mv(0, 0, true) }, DT, ON);
    expect(ev.filter((e) => e.type === 'pushed')).toHaveLength(2);
    run([a, b], {}, 0.5);
    expect(a.pos.x).toBeLessThan(0);
    expect(b.pos.x).toBeGreaterThan(1);
  });

  test('allowPush false: sem evento e recarga não consumida', () => {
    const ps = duel(1, 0);
    const ev = stepPhysics(ps, { P1: mv(0, 0, true) }, DT, { allowMove: true, allowPush: false });
    expect(ev).toEqual([]);
    expect(ps[0].pushCooldown).toBe(0);
    expect(ps[0].frozen).toBe(0);
  });

  test('fallen ou fora de jogo não são alvo', () => {
    const ps = duel(1, 0);
    ps[1].fallen = true;
    const ev = stepPhysics(ps, { P1: mv(0, 0, true) }, DT, ON);
    expect(ev).toEqual([{ type: 'pushed', by: 'P1', targets: [] }]);
  });
});
