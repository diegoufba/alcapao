import { test, expect, describe, vi, afterEach } from 'vitest';
import { joinSession } from '../../src/net/client-session';
import { bankHash, decodeClient, encode, PROTOCOL_VERSION, SILENCE_TIMEOUT_S } from '../../src/net/protocol';
import type { ClientMsg, HostMsg } from '../../src/net/protocol';
import { NetError } from '../../src/net/transport';
import { createSnapshotBuffer } from '../../src/net/snapshots';
import { createRemoteSource } from '../../src/sim/remote';
import { createGame } from '../../src/core/game';
import type { GameConfig } from '../../src/core/game';
import type { PlayerId, PlayerInput, Vec2 } from '../../src/core/types';
import { bank } from '../helpers/bank';
import { createLinkPair } from './fake-link';

const BANK = bank();
const CONFIG: GameConfig = { mode: 'survival', players: ['P1', 'P2'], seed: 1 };

afterEach(() => { vi.useRealTimers(); });

/** Host falso: o teste manda as mensagens à mão e lê o que o cliente enviou. */
function setup() {
  const [hostSide, clientSide] = createLinkPair();
  const received: ClientMsg[] = [];
  hostSide.onMessage((_ch, data) => {
    const m = decodeClient(data);
    if (m) received.push(m);
  });
  const say = (m: HostMsg, ch: 'ctl' | 'snap' = 'ctl') => hostSide.send(ch, encode(m));
  return { hostSide, clientSide, received, say };
}

async function welcomed(you: PlayerId = 'P2') {
  const s = setup();
  const p = joinSession(s.clientSide, BANK);
  s.say({ t: 'welcome', you });
  s.say({ t: 'lobby', lobby: { players: ['P1', you], mode: 'survival', rounds: 12, started: false } });
  const session = await p;
  return { ...s, session };
}

describe('ClientSession', () => {
  test('manda hello com a versão e o hash do banco', () => {
    const s = setup();
    void joinSession(s.clientSide, BANK);
    expect(s.received[0]).toEqual({ t: 'hello', protocol: PROTOCOL_VERSION, build: bankHash(BANK) });
  });

  test('resolve com you do welcome', async () => {
    const { session } = await welcomed('P3');
    expect(session.you).toBe('P3');
    expect(session.label('P3')).toBe('Você');
    expect(session.label('P1')).toBe('Online');
    expect(session.lobby().players).toEqual(['P1', 'P3']);
  });

  test('rejected full rejeita com NetError full', async () => {
    const s = setup();
    const p = joinSession(s.clientSide, BANK);
    s.say({ t: 'rejected', reason: 'full' });
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NetError);
    expect((err as NetError).kind).toBe('full');
  });

  test('mensagem lixo antes do welcome é ignorada', async () => {
    const s = setup();
    const p = joinSession(s.clientSide, BANK);
    s.hostSide.send('ctl', '{');
    s.hostSide.send('ctl', JSON.stringify({ t: 'welcome', you: 'P9' }));
    s.say({ t: 'welcome', you: 'P2' });
    expect((await p).you).toBe('P2');
  });

  test('host fecha no lobby → onClosed host-left', async () => {
    const { session, hostSide } = await welcomed();
    const why: string[] = [];
    session.onClosed((w) => why.push(w));
    hostSide.close();
    expect(why).toEqual(['host-left']);
  });

  test(`${SILENCE_TIMEOUT_S} s sem mensagens do host → onClosed host-left e fecha`, async () => {
    vi.useFakeTimers();
    const { session, clientSide } = await welcomed();
    const why: string[] = [];
    session.onClosed((w) => why.push(w));
    vi.advanceTimersByTime(7900);
    expect(why).toEqual([]);
    vi.advanceTimersByTime(200);
    expect(why).toEqual(['host-left']);
    expect(clientSide.closed).toBe(true);
  });

  test('mensagens regulares do host mantêm a sessão viva', async () => {
    vi.useFakeTimers();
    const { session, say } = await welcomed();
    const why: string[] = [];
    session.onClosed((w) => why.push(w));
    for (let t = 0; t < 30; t++) {
      vi.advanceTimersByTime(1000);
      say({ t: 'pong', at: Date.now() });
    }
    expect(why).toEqual([]);
    session.close();
  });

  test('mensagem closed → onClosed host-left uma vez só', async () => {
    const { session, say } = await welcomed();
    const why: string[] = [];
    session.onClosed((w) => why.push(w));
    say({ t: 'closed' });
    expect(why).toEqual(['host-left']);
  });

  test('close do próprio cliente manda bye e não chama onClosed', async () => {
    const { session, received, clientSide } = await welcomed();
    const why: string[] = [];
    session.onClosed((w) => why.push(w));
    session.close();
    expect(received.at(-1)).toEqual({ t: 'bye' });
    expect(clientSide.closed).toBe(true);
    expect(why).toEqual([]);
  });

  test('onLobby acompanha o lobby do host', async () => {
    const { session, say } = await welcomed();
    const seen: string[] = [];
    session.onLobby((l) => seen.push(`${l.mode}-${l.rounds}`));
    say({ t: 'lobby', lobby: { players: ['P1', 'P2'], mode: 'points', rounds: 16, started: false } });
    expect(seen).toEqual(['points-16']);
    expect(session.lobby().mode).toBe('points');
  });

  test('onStart recebe a config', async () => {
    const { session, say } = await welcomed();
    const configs: GameConfig[] = [];
    session.onStart((c) => configs.push(c));
    say({ t: 'start', config: CONFIG });
    expect(configs).toEqual([CONFIG]);
  });

  test('left marca o jogador desconectado', async () => {
    const { session, say } = await welcomed();
    say({ t: 'start', config: CONFIG });
    expect(session.isConnected('P1')).toBe(true);
    say({ t: 'left', id: 'P1' });
    expect(session.isConnected('P1')).toBe(false);
  });

  test('snap antes do start é ignorado; depois do start alimenta a fonte', async () => {
    const { session, say } = await welcomed();
    const state = createGame(CONFIG, BANK).state;
    say({ t: 'snap', tick: 1, state }, 'snap');
    expect(session.snapshotAge()).toBe(Infinity);
    say({ t: 'start', config: CONFIG });
    const src = session.source();
    expect(src.advance(0, new Map())).toBeNull();
    say({ t: 'snap', tick: 10, state }, 'snap');
    const frame = src.advance(1 / 60, new Map());
    expect(frame?.state.phase).toBe(state.phase);
    expect(session.snapshotAge()).toBeCloseTo(1 / 60);
  });

  const inputsSent = (received: ClientMsg[]) =>
    received.filter((m): m is Extract<ClientMsg, { t: 'input' }> => m.t === 'input');
  const apertou = new Map<PlayerId, PlayerInput>([['P2', { move: { x: 0, z: 0 }, push: true }]]);

  test('source() chamado duas vezes na mesma partida devolve a mesma fonte', async () => {
    const { session, say, received } = await welcomed();
    say({ t: 'start', config: CONFIG });
    const src = session.source();
    expect(session.source()).toBe(src);
    src.advance(1 / 60, apertou);
    session.source().advance(1 / 60, apertou);
    expect(inputsSent(received).map((m) => m.pushCount)).toEqual([1, 2]);
  });

  test('o pushCount continua crescendo entre duas partidas na mesma conexão', async () => {
    const { session, say, received } = await welcomed();
    say({ t: 'start', config: CONFIG });
    const s1 = session.source();
    s1.advance(1 / 60, apertou);
    s1.advance(1 / 60, apertou);
    say({ t: 'lobby', lobby: { players: ['P1', 'P2'], mode: 'survival', rounds: 12, started: false } });
    say({ t: 'start', config: CONFIG });
    const s2 = session.source();
    expect(s2).not.toBe(s1);
    s2.advance(1 / 60, new Map());
    s2.advance(1 / 60, apertou);
    expect(inputsSent(received).map((m) => m.pushCount)).toEqual([1, 2, 2, 3]);
  });

  test('ping a cada 1 s e rtt pelo pong', async () => {
    vi.useFakeTimers();
    const { session, received, say } = await welcomed();
    expect(session.rtt()).toBe(Infinity);
    vi.advanceTimersByTime(1000);
    const ping = received.at(-1);
    expect(ping?.t).toBe('ping');
    vi.advanceTimersByTime(40);
    say({ t: 'pong', at: (ping as { at: number }).at });
    expect(session.rtt()).toBe(40);
    session.close();
    const n = received.length;
    vi.advanceTimersByTime(5000);
    expect(received.length).toBe(n); // parou de pingar
  });
});

describe('createRemoteSource', () => {
  const PARADO: Vec2 = { x: 0, z: 0 };
  const input = (move: Vec2, push = false) => new Map<PlayerId, PlayerInput>([['P2', { move, push }]]);

  test('source() gera input com pushCount crescente e heartbeat', () => {
    const sent: [Vec2, number][] = [];
    const src = createRemoteSource(createSnapshotBuffer(), 'P2', (m, c) => sent.push([m, c]));
    expect(src.pausable).toBe(false);

    src.advance(1 / 60, input(PARADO));
    expect(sent).toEqual([[PARADO, 0]]); // primeiro envio
    src.advance(1 / 60, input(PARADO));
    expect(sent.length).toBe(1); // nada mudou

    src.advance(1 / 60, input(PARADO, true));
    expect(sent.at(-1)).toEqual([PARADO, 1]);
    src.advance(1 / 60, input(PARADO, true));
    expect(sent.at(-1)).toEqual([PARADO, 2]);

    src.advance(1 / 60, input({ x: 1, z: 0 }));
    expect(sent.at(-1)).toEqual([{ x: 1, z: 0 }, 2]);
    expect(sent.length).toBe(4);

    src.advance(0.1, input({ x: 1, z: 0 }));
    expect(sent.length).toBe(4);
    src.advance(0.2, input({ x: 1, z: 0 })); // heartbeat
    expect(sent.length).toBe(5);
    expect(sent.at(-1)).toEqual([{ x: 1, z: 0 }, 2]);
  });

  test('sem input local manda parado', () => {
    const sent: [Vec2, number][] = [];
    const src = createRemoteSource(createSnapshotBuffer(), 'P2', (m, c) => sent.push([m, c]));
    src.advance(1 / 60, new Map());
    expect(sent).toEqual([[PARADO, 0]]);
  });

  test('advance devolve o quadro do buffer', () => {
    const buffer = createSnapshotBuffer();
    const src = createRemoteSource(buffer, 'P2', () => {});
    expect(src.advance(1 / 60, new Map())).toBeNull();
    buffer.pushSnap(5, createGame(CONFIG, BANK).state);
    expect(src.advance(1 / 60, new Map())).not.toBeNull();
  });
});
