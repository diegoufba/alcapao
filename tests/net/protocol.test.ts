import { test, expect, describe } from 'vitest';
import { bank } from '../helpers/bank';
import { createGame } from '../../src/core/game';
import type { GameEvent, ShownQuestion } from '../../src/core/types';
import {
  PROTOCOL_VERSION, bankHash, decodeClient, decodeHost, encode,
  type ClientMsg, type HostMsg,
} from '../../src/net/protocol';

const pergunta: ShownQuestion = {
  id: 't0-0', theme: 'Tema0', difficulty: 1, text: 'Pergunta', options: ['a', 'b', 'c', 'd'], correct: 'B', value: 1,
};

const eventos: GameEvent[] = [
  { type: 'phaseChanged', phase: 'question' },
  { type: 'themeChosen', theme: 'Tema0' },
  { type: 'questionShown', question: pergunta },
  { type: 'pushed', by: 'P1', targets: ['P2', 'P3'] },
  { type: 'bumped', a: 'P1', b: 'P2' },
  { type: 'locked', zones: { P1: 'A', P2: null } },
  { type: 'revealed', correct: 'C', fallen: ['P2'], voided: false, scored: { P1: 2 } },
  { type: 'respawned', players: ['P2'] },
  { type: 'suddenDeathStarted', players: ['P1', 'P2'] },
  { type: 'gameOver', ranking: [{ pos: 1, id: 'P1', score: 5 }, { pos: 2, id: 'P2', eliminatedRound: 3 }], roundsSurvived: 3, scores: { P1: 5 } },
];

type Snap = { players: Record<string, unknown>[] } & Record<string, unknown>;

function estadoDeJogo() {
  const game = createGame({ mode: 'points', rounds: 8, players: ['P1', 'P2'], seed: 7 }, bank());
  for (let i = 0; i < 300; i++) game.step(1 / 60, {});
  return game.state;
}

describe('protocol', () => {
  test('ida e volta de cada mensagem', () => {
    const cliente: ClientMsg[] = [
      { t: 'hello', protocol: PROTOCOL_VERSION, build: 'abcd1234' },
      { t: 'input', move: { x: 0.5, z: -1 }, pushCount: 3 },
      { t: 'ping', at: 123 },
      { t: 'bye' },
    ];
    for (const m of cliente) expect(decodeClient(encode(m))).toEqual(m);

    const host: HostMsg[] = [
      { t: 'welcome', you: 'P2' },
      { t: 'lobby', lobby: { players: ['P1', 'P2'], mode: 'points', rounds: 12, started: false } },
      { t: 'start', config: { mode: 'survival', players: ['P1', 'P2'], seed: 42 } },
      { t: 'start', config: { mode: 'points', rounds: 16, players: ['P1', 'P3'], seed: 1 } },
      { t: 'events', tick: 10, events: eventos },
      { t: 'snap', tick: 20, state: estadoDeJogo(), themes: ['Tema0', 'Tema1'] },
      { t: 'snap', tick: 21, state: estadoDeJogo() },
      { t: 'pong', at: 123 },
      { t: 'left', id: 'P3' },
      { t: 'rejected', reason: 'full' },
      { t: 'rejected', reason: 'started' },
      { t: 'rejected', reason: 'version' },
      { t: 'closed' },
    ];
    for (const m of host) expect(decodeHost(encode(m))).toEqual(m);
  });

  test('ignora campos a mais', () => {
    expect(decodeClient('{"t":"ping","at":1,"extra":true}')).toEqual({ t: 'ping', at: 1 });
  });

  test('recusa entrada malformada', () => {
    const snap = (mod: (s: Snap) => void) => {
      const state = JSON.parse(JSON.stringify(estadoDeJogo())) as Snap;
      mod(state);
      return JSON.stringify({ t: 'snap', tick: 1, state });
    };
    const clientes: string[] = [
      '{', 'null', '[]', '{"t":"nada"}',
      JSON.stringify({ t: 'input', pushCount: 1 }),
      JSON.stringify({ t: 'input', move: { x: '1', z: 0 }, pushCount: 1 }),
    ];
    for (const raw of clientes) expect(decodeClient(raw), raw).toBeNull();

    const hosts: string[] = [
      '{', 'null', '[]', '{"t":"nada"}',
      snap((s) => { s.players[0].id = 'P9'; }),
      snap((s) => { s.phaseTime = null; }),
      snap((s) => { s.phase = 'x'; }),
      snap((s) => { delete s.players[0].knockVel; }),
      snap((s) => { s.question = { ...pergunta, options: ['a', 'b', 'c'] }; }),
      JSON.stringify({ t: 'events', tick: 1, events: [{ type: 'locked', zones: { P1: 'E' } }] }),
      JSON.stringify({ t: 'events', tick: 1, events: [{ type: 'inventado' }] }),
      JSON.stringify({ t: 'start', config: { mode: 'points', rounds: 10, players: ['P1', 'P2'], seed: 1 } }),
      JSON.stringify({ t: 'start', config: { mode: 'survival', players: ['P1', 'P1'], seed: 1 } }),
      JSON.stringify({ t: 'rejected', reason: 'outro' }),
    ];
    for (const raw of hosts) expect(decodeHost(raw), raw).toBeNull();
  });

  test('bankHash muda se um id muda e é estável', () => {
    const a = bank();
    expect(bankHash(a)).toBe(bankHash(bank()));
    expect(bankHash(a)).toMatch(/^[0-9a-f]{8}$/);
    const b = bank();
    b[3] = { ...b[3], id: 'outro' };
    expect(bankHash(b)).not.toBe(bankHash(a));
  });
});
