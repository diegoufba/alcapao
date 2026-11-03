import { describe, expect, test } from 'vitest';
import { createGame, type GameConfig } from '../../src/core/game';
import { PLATFORM_CENTERS } from '../../src/core/arena';
import type { GameEvent, PlayerId, PlayerInput } from '../../src/core/types';
import type { SimSource } from '../../src/sim/source';
import { createLocalSource } from '../../src/sim/local';
import { bank } from '../helpers/bank';

const DT = 1 / 60;
const config: GameConfig = { mode: 'survival', players: ['P1', 'P2'], seed: 7 };
const mv = (x: number, push = false): PlayerInput => ({ move: { x, z: 0 }, push });
/** Pula a roleta: personagens só se mexem na fase da pergunta. */
function toQuestion(src: SimSource): void {
  src.advance(DT, new Map()); // o primeiro passo entra na roleta
  src.skipPhase();
  src.advance(DT, new Map());
}
const inputs = (o: Partial<Record<PlayerId, PlayerInput>>): Map<PlayerId, PlayerInput> => new Map(Object.entries(o) as [PlayerId, PlayerInput][]);

describe('createLocalSource', () => {
  test('mesma seed e mesmos inputs dão o mesmo estado que createGame direto', () => {
    const src = createLocalSource(config, bank());
    const game = createGame(config, bank());
    let frame = null;
    for (let i = 0; i < 120; i++) {
      frame = src.advance(DT, inputs({ P1: mv(1) }));
      game.step(DT, { P1: mv(1) });
    }
    expect(frame!.state).toEqual(game.state);
  });

  test('empurrão de um quadro sem passo é aplicado no passo seguinte, uma única vez', () => {
    const src = createLocalSource(config, bank());
    toQuestion(src);
    const events: GameEvent[] = [];
    events.push(...src.advance(0.001, inputs({ P1: mv(0, true) }))!.events);
    events.push(...src.advance(DT, inputs({ P1: mv(0, false) }))!.events);
    const pushed = events.filter((e) => e.type === 'pushed');
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ by: 'P1' });
    for (let i = 0; i < 30; i++) events.push(...src.advance(DT, inputs({ P1: mv(0, false) }))!.events);
    expect(events.filter((e) => e.type === 'pushed')).toHaveLength(1);
  });

  test('positions interpola entre o passo anterior e o atual', () => {
    const src = createLocalSource(config, bank());
    toQuestion(src);
    const f0 = src.advance(DT, inputs({ P1: mv(1) }))!;
    const x0 = f0.state.players[0].pos.x; // fim do passo 0
    const f1 = src.advance(1.5 / 60, inputs({ P1: mv(1) }))!; // 1 passo + alpha 0,5
    const x1 = f1.state.players[0].pos.x;
    const xi = f1.positions.get('P1')!.x;
    expect(x1).toBeGreaterThan(x0);
    expect(xi).toBeGreaterThan(x0);
    expect(xi).toBeLessThan(x1);
  });

  test('respawned zera a interpolação daquele jogador', () => {
    const src = createLocalSource({ mode: 'points', rounds: 8, players: ['P1'], seed: 5 }, bank());
    let found = false;
    let last = src.advance(DT, new Map())!;
    for (let i = 0; i < 60 * 120 && !found; i++) {
      const q = last.state.question;
      const wrong = q && q.correct === 'A' ? 'B' : 'A';
      const move = last.state.phase === 'question' ? dirTo(last.state.players[0].pos, PLATFORM_CENTERS[wrong]) : { x: 0, z: 0 };
      last = src.advance(DT, inputs({ P1: { move, push: false } }))!;
      if (last.events.some((e) => e.type === 'respawned')) {
        found = true;
        expect(last.positions.get('P1')).toEqual(last.state.players[0].pos);
      }
    }
    expect(found).toBe(true);
  });

  test('afterFrame recebe tick acumulado', () => {
    const ticks: number[] = [];
    const src = createLocalSource(config, bank(), { afterFrame: (t) => { ticks.push(t); } });
    src.advance(2 / 60, new Map());
    src.advance(1 / 60, new Map());
    expect(ticks).toEqual([2, 3]);
  });

  test('remoteInputs entra só para os jogadores dele', () => {
    const src = createLocalSource(config, bank(), { remoteInputs: () => inputs({ P2: mv(1) }) });
    toQuestion(src);
    const f = src.advance(DT, inputs({ P1: mv(-1) }))!;
    expect(f.state.players.find((p) => p.id === 'P2')!.vel.x).toBeGreaterThan(0);
    expect(f.state.players.find((p) => p.id === 'P1')!.vel.x).toBeLessThan(0);
  });

  test('pausable só sem ganchos', () => {
    expect(createLocalSource(config, bank()).pausable).toBe(true);
    expect(createLocalSource(config, bank(), {}).pausable).toBe(false);
  });
});

function dirTo(from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number } {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
  return d < 0.3 ? { x: 0, z: 0 } : { x: dx / d, z: dz / d };
}
