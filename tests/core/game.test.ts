import { test, expect, describe } from 'vitest';
import { createGame } from '../../src/core/game';
import type { Game } from '../../src/core/game';
import { bank } from '../helpers/bank';
import { PLATFORM_CENTERS, SPAWNS } from '../../src/core/arena';
import type { GameEvent, Phase, PlayerId, PlayerInput, Question, Vec2 } from '../../src/core/types';

const DT = 1 / 60;
type InputsFn = (g: Game) => Partial<Record<PlayerId, PlayerInput>>;
type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;

function run(game: Game, seconds: number, inputsFn?: InputsFn): GameEvent[] {
  const events: GameEvent[] = [];
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) events.push(...game.step(DT, inputsFn ? inputsFn(game) : {}));
  return events;
}

function runUntil(game: Game, pred: (g: Game) => boolean, inputsFn?: InputsFn, maxSeconds = 600): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < maxSeconds * 60 && !pred(game); i++) {
    events.push(...game.step(DT, inputsFn ? inputsFn(game) : {}));
  }
  return events;
}

const inPhase = (phase: Phase) => (g: Game): boolean => g.state.phase === phase;
const ofType = <T extends GameEvent['type']>(evs: GameEvent[], type: T): Ev<T>[] =>
  evs.filter((e): e is Ev<T> => e.type === type);

/** Dirige o boneco até target (distância ≤ 0,3 m e para). */
function steer(g: Game, id: PlayerId, target: Vec2): PlayerInput {
  const p = g.state.players.find((x) => x.id === id)!;
  const dx = target.x - p.pos.x;
  const dz = target.z - p.pos.z;
  const d = Math.hypot(dx, dz);
  return { move: d <= 0.3 ? { x: 0, z: 0 } : { x: dx / d, z: dz / d }, push: false };
}

/** `right` vão à plataforma correta; os demais ficam parados (sem input) na faixa neutra. */
const answer = (right: PlayerId[]): InputsFn => (g) => {
  const inputs: Partial<Record<PlayerId, PlayerInput>> = {};
  const q = g.state.question;
  if (q) for (const id of right) inputs[id] = steer(g, id, PLATFORM_CENTERS[q.correct]);
  return inputs;
};

describe('sequência de fases', () => {
  test('spin → question → lock → reveal → reset → spin da rodada 2', () => {
    const g = createGame({ mode: 'survival', players: ['P1', 'P2'], seed: 1 }, bank());
    expect(g.state.phase).toBe('spin');
    expect(g.state.round).toBe(1);

    const first = run(g, 3);
    expect(first.slice(0, 2).map((e) => e.type)).toEqual(['phaseChanged', 'themeChosen']);
    expect(g.state.phase).toBe('question');
    expect(g.state.phaseTime).toBeCloseTo(15, 6);
    expect(g.state.question).not.toBeNull();

    const seen: Phase[] = [];
    const events = runUntil(g, (x) => x.state.round === 2, (x) => {
      const ph = x.state.phase;
      if (seen[seen.length - 1] !== ph) seen.push(ph);
      return answer([])(x);
    });
    expect(seen).toEqual(['question', 'lock', 'reveal', 'reset']);
    expect(g.state.phase).toBe('spin');
    expect(ofType(events, 'phaseChanged').map((e) => e.phase)).toEqual(['lock', 'reveal', 'reset', 'spin']);
  });

  test('durações: lock 0,5 s, reveal 3 s, reset 1,5 s', () => {
    const g = createGame({ mode: 'survival', players: ['P1', 'P2'], seed: 1 }, bank());
    const wrong = answer([]);
    run(g, 3, wrong);
    g.debugSkipPhase();
    g.step(DT, wrong(g));
    expect(g.state.phase).toBe('lock');
    run(g, 0.5, wrong);
    expect(g.state.phase).toBe('reveal');
    run(g, 3, wrong);
    expect(g.state.phase).toBe('reset');
    run(g, 1.5, wrong);
    expect(g.state.phase).toBe('spin');
  });

  test('debugSkipPhase em question: o próximo step já está em lock', () => {
    const g = createGame({ mode: 'survival', players: ['P1', 'P2'], seed: 1 }, bank());
    run(g, 3);
    expect(g.state.phase).toBe('question');
    g.debugSkipPhase();
    const evs = g.step(DT, {});
    expect(g.state.phase).toBe('lock');
    expect(ofType(evs, 'locked')).toHaveLength(1);
  });

  test('a pergunta usa tempo e valor da dificuldade real', () => {
    const g = createGame({ mode: 'points', rounds: 8, players: ['P1'], seed: 3 }, bank());
    const evs = run(g, 3);
    const q = ofType(evs, 'questionShown')[0].question;
    expect(q.difficulty).toBe(1);
    expect(q.value).toBe(100);
    expect(g.state.phaseTime).toBeCloseTo(15, 6);
  });
});

describe('Sobrevivência', () => {
  test('2 jogadores: quem erra cai e a partida termina com P1 em 1º', () => {
    const g = createGame({ mode: 'survival', players: ['P1', 'P2'], seed: 5 }, bank());
    const evs = runUntil(g, inPhase('over'), answer(['P1']));
    expect(ofType(evs, 'revealed')[0].fallen).toEqual(['P2']);
    const over = ofType(evs, 'gameOver')[0];
    expect(over.ranking.map((r) => [r.id, r.pos])).toEqual([['P1', 1], ['P2', 2]]);
    expect(over.roundsSurvived).toBeUndefined();
  });

  test('ambos errando: rodada anulada e a partida segue na rodada 2', () => {
    const g = createGame({ mode: 'survival', players: ['P1', 'P2'], seed: 5 }, bank());
    const evs = runUntil(g, (x) => x.state.round === 2, answer([]));
    const rev = ofType(evs, 'revealed')[0];
    expect(rev.voided).toBe(true);
    expect(rev.fallen).toEqual([]);
    expect(g.state.players.every((p) => p.inPlay)).toBe(true);
    expect(ofType(evs, 'gameOver')).toHaveLength(0);
  });

  test('solo errando termina com roundsSurvived 0', () => {
    const g = createGame({ mode: 'survival', players: ['P1'], seed: 5 }, bank());
    const evs = runUntil(g, inPhase('over'), answer([]));
    const over = ofType(evs, 'gameOver')[0];
    expect(over.roundsSurvived).toBe(0);
    expect(over.ranking).toEqual([{ pos: 1, id: 'P1', eliminatedRound: 1 }]);
  });

  test('quem caiu perde inPlay no fim do reset; sobreviventes voltam ao spawn', () => {
    const g = createGame({ mode: 'survival', players: ['P1', 'P2', 'P3'], seed: 9 }, bank());
    runUntil(g, (x) => x.state.round === 2, answer(['P1', 'P2']));
    const byId = Object.fromEntries(g.state.players.map((p) => [p.id, p]));
    expect(byId.P3.inPlay).toBe(false);
    expect(byId.P1.inPlay && byId.P2.inPlay).toBe(true);
    expect(byId.P1.pos).toEqual(SPAWNS.P1);
    expect(byId.P2.pos).toEqual(SPAWNS.P2);
    expect(byId.P1.fallen).toBe(false);
  });
});

describe('Pontos', () => {
  test('acerto na rodada 1 soma 100; respawned traz quem caiu e as posições voltam', () => {
    const g = createGame({ mode: 'points', rounds: 8, players: ['P1', 'P2'], seed: 2 }, bank());
    const evs = runUntil(g, (x) => x.state.round === 2, answer(['P1']));
    const rev = ofType(evs, 'revealed')[0];
    expect(rev.scored).toEqual({ P1: 100 });
    expect(rev.fallen).toEqual(['P2']);
    expect(ofType(evs, 'respawned')).toEqual([{ type: 'respawned', players: ['P2'] }]);
    const [p1, p2] = g.state.players;
    expect(p1.score).toBe(100);
    expect(p2.score).toBe(0);
    expect(p1.pos).toEqual(SPAWNS.P1);
    expect(p2.pos).toEqual(SPAWNS.P2);
    expect(p2.fallen).toBe(false);
    expect(p2.inPlay).toBe(true);
  });

  test('N=8, ninguém pontua: empate no topo dispara morte súbita com todos; P1 vence', () => {
    const g = createGame({ mode: 'points', rounds: 8, players: ['P1', 'P2'], seed: 4 }, bank());
    const first = runUntil(g, (x) => x.state.suddenDeath !== null, answer([]));
    expect(ofType(first, 'suddenDeathStarted')).toEqual([{ type: 'suddenDeathStarted', players: ['P1', 'P2'] }]);
    expect(ofType(first, 'gameOver')).toHaveLength(0);
    expect(g.state.round).toBe(9);

    const rest = runUntil(g, inPhase('over'), answer(['P1']));
    const q = ofType(rest, 'questionShown')[0].question;
    expect(q.difficulty).toBe(3);
    const over = ofType(rest, 'gameOver')[0];
    expect(over.ranking.map((r) => [r.id, r.pos])).toEqual([['P1', 1], ['P2', 2]]);
    expect(over.scores).toEqual({ P1: 0, P2: 0 });
  });

  test('sem empate no topo, termina após N rodadas com o ranking por pontos', () => {
    const g = createGame({ mode: 'points', rounds: 8, players: ['P1', 'P2'], seed: 4 }, bank());
    const evs = runUntil(g, inPhase('over'), answer(['P1']));
    expect(ofType(evs, 'suddenDeathStarted')).toHaveLength(0);
    const over = ofType(evs, 'gameOver')[0];
    expect(over.ranking[0]).toMatchObject({ id: 'P1', pos: 1 });
    expect(over.ranking[1]).toMatchObject({ id: 'P2', pos: 2, score: 0 });
    expect(over.scores?.P1).toBeGreaterThan(0);
    expect(ofType(evs, 'revealed')).toHaveLength(8);
  });

  test('morte súbita só entre os empatados; os demais viram espectadores', () => {
    const g = createGame({ mode: 'points', rounds: 8, players: ['P1', 'P2', 'P3'], seed: 4 }, bank());
    const evs = runUntil(g, (x) => x.state.suddenDeath !== null, answer(['P1', 'P2']));
    expect(ofType(evs, 'suddenDeathStarted')[0].players).toEqual(['P1', 'P2']);
    expect(g.state.suddenDeath).toEqual(['P1', 'P2']);
    expect(g.state.players.map((p) => p.inPlay)).toEqual([true, true, false]);
  });
});

describe('empurrão e física', () => {
  test('push durante spin não gera pushed; em question gera', () => {
    const g = createGame({ mode: 'survival', players: ['P1', 'P2'], seed: 1 }, bank());
    const [p1, p2] = g.state.players;
    p1.pos = { x: 0, z: 0 }; p1.facing = Math.PI / 2;
    p2.pos = { x: 0.6, z: 0 };
    const push: Partial<Record<PlayerId, PlayerInput>> = { P1: { move: { x: 0, z: 0 }, push: true } };
    expect(ofType(g.step(DT, push), 'pushed')).toHaveLength(0);
    g.debugSkipPhase();
    run(g, 0.05);
    expect(g.state.phase).toBe('question');
    p1.pos = { x: 0, z: 0 }; p2.pos = { x: 0.6, z: 0 };
    expect(ofType(g.step(DT, push), 'pushed')).toEqual([{ type: 'pushed', by: 'P1', targets: ['P2'] }]);
  });
});

describe('perguntas esgotadas', () => {
  test('Sobrevivência: com 2 perguntas, na rodada 3 os dois vivos empatam em 1º', () => {
    const two = bank().filter((q) => q.id === 't0-0' || q.id === 't0-1');
    const g = createGame({ mode: 'survival', players: ['P1', 'P2'], seed: 1 }, two);
    const evs = runUntil(g, inPhase('over'), answer(['P1', 'P2']));
    expect(g.state.round).toBe(3);
    const over = ofType(evs, 'gameOver')[0];
    expect(over.ranking.map((r) => [r.id, r.pos])).toEqual([['P1', 1], ['P2', 1]]);
  });

  test('Solo: esgotar conta como fim normal com roundsSurvived = round - 1', () => {
    const one = bank().filter((q) => q.id === 't0-0');
    const g = createGame({ mode: 'survival', players: ['P1'], seed: 1 }, one);
    const evs = runUntil(g, inPhase('over'), answer(['P1']));
    expect(ofType(evs, 'gameOver')[0].roundsSurvived).toBe(1);
  });

  test('Pontos: termina com o placar atual, sem morte súbita', () => {
    const two = bank().filter((q) => q.id === 't0-0' || q.id === 't0-1');
    const g = createGame({ mode: 'points', rounds: 8, players: ['P1', 'P2'], seed: 1 }, two);
    const evs = runUntil(g, inPhase('over'), answer([]));
    expect(ofType(evs, 'suddenDeathStarted')).toHaveLength(0);
    const over = ofType(evs, 'gameOver')[0];
    expect(over.ranking.map((r) => [r.id, r.pos])).toEqual([['P1', 1], ['P2', 1]]);
    expect(over.scores).toEqual({ P1: 0, P2: 0 });
  });

  test('Morte súbita: contenders restantes dividem o 1º lugar', () => {
    // 8 rodadas + 1 morte súbita precisam de 9 perguntas; o banco tem 8 -> esgota na morte súbita.
    const eight = bank().slice(0, 8);
    const g = createGame({ mode: 'points', rounds: 8, players: ['P1', 'P2', 'P3'], seed: 1 }, eight);
    const evs = runUntil(g, inPhase('over'), answer([]));
    expect(ofType(evs, 'suddenDeathStarted')).toHaveLength(1);
    const over = ofType(evs, 'gameOver')[0];
    expect(over.ranking.map((r) => [r.id, r.pos])).toEqual([['P1', 1], ['P2', 1], ['P3', 1]]);
  });
});

describe('geral', () => {
  test('mesma semente → mesma sequência de temas e perguntas', () => {
    const trace = (): string[] => {
      const g = createGame({ mode: 'points', rounds: 8, players: ['P1', 'P2'], seed: 77 }, bank());
      const evs = run(g, 60, answer([]));
      return evs.flatMap((e) =>
        e.type === 'themeChosen' ? [e.theme] : e.type === 'questionShown' ? [e.question.id, e.question.correct] : []);
    };
    const a = trace();
    expect(a.length).toBeGreaterThan(6);
    expect(trace()).toEqual(a);
  });

  test('após gameOver, step devolve [] e nada muda', () => {
    const g = createGame({ mode: 'survival', players: ['P1'], seed: 5 }, bank());
    runUntil(g, inPhase('over'), answer([]));
    const snapshot = JSON.stringify(g.state);
    expect(g.step(DT, {})).toEqual([]);
    expect(JSON.stringify(g.state)).toBe(snapshot);
  });
});

describe('respawn e temas', () => {
  test('Pontos: quem caiu já está no SPAWN no primeiro passo do RESET', () => {
    const g = createGame({ mode: 'points', rounds: 8, players: ['P1', 'P2'], seed: 2 }, bank());
    const wrong = (x: Game): Partial<Record<PlayerId, PlayerInput>> => {
      const q = x.state.question;
      if (!q) return {};
      const bad = q.correct === 'A' ? 'B' : 'A';
      return { P1: steer(x, 'P1', PLATFORM_CENTERS[q.correct]), P2: steer(x, 'P2', PLATFORM_CENTERS[bad]) };
    };
    runUntil(g, inPhase('reveal'), wrong);
    expect(g.state.players[1].pos).not.toEqual(SPAWNS.P2); // caiu longe do slot
    runUntil(g, inPhase('reset'), wrong);
    const p2 = g.state.players[1];
    expect(p2.fallen).toBe(true);
    expect(p2.pos).toEqual(SPAWNS.P2);
    expect(p2.vel).toEqual({ x: 0, z: 0 });
    expect(p2.frozen).toBe(0);
  });

  test('availableThemes lista só temas com perguntas restantes', () => {
    const one = (t: string): Question => ({ id: t, theme: t, difficulty: 1, text: t, options: ['a', 'b', 'c', 'd'], correct: 0 });
    const g = createGame({ mode: 'survival', players: ['P1'], seed: 1 }, [one('X'), one('Y')]);
    expect(g.availableThemes().sort()).toEqual(['X', 'Y']);
    const ev = runUntil(g, inPhase('question'));
    const used = ofType(ev, 'themeChosen')[0].theme;
    expect(g.availableThemes()).toEqual([used === 'X' ? 'Y' : 'X']);
  });
});
