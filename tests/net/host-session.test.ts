import { test, expect, describe } from 'vitest';
import { createHostSession } from '../../src/net/host-session';
import { bankHash, decodeHost, encode, PROTOCOL_VERSION } from '../../src/net/protocol';
import type { HostMsg } from '../../src/net/protocol';
import { createGame } from '../../src/core/game';
import type { Channel } from '../../src/net/transport';
import { bank } from '../helpers/bank';
import { createFakeRoom } from './fake-link';
import type { FakeLink } from './fake-link';

const BANK = bank();

function setup() {
  const room = createFakeRoom();
  const host = createHostSession(room, BANK);
  return { room, host };
}

/** Coleta as mensagens que o cliente recebe do host. */
function inbox(link: FakeLink): { ch: Channel; msg: HostMsg }[] {
  const got: { ch: Channel; msg: HostMsg }[] = [];
  link.onMessage((ch, data) => {
    const msg = decodeHost(data);
    if (msg) got.push({ ch, msg });
  });
  return got;
}

const hello = (build = bankHash(BANK)) => encode({ t: 'hello', protocol: PROTOCOL_VERSION, build });

function join(room: ReturnType<typeof createFakeRoom>) {
  const link = room.connect();
  const got = inbox(link);
  link.send('ctl', hello());
  return { link, got };
}

describe('HostSession', () => {
  test('host ocupa P1 desde o começo', () => {
    const { host } = setup();
    expect(host.lobby()).toEqual({ players: ['P1'], mode: 'survival', rounds: 12, started: false });
    expect(host.isConnected('P1')).toBe(true);
    expect(host.label('P1')).toBe('Você');
    expect(host.code).toBe('ABCDE');
  });

  test('hello válido ganha P2 e todos recebem lobby', () => {
    const { room, host } = setup();
    const lobbies: string[][] = [];
    host.onLobby((l) => lobbies.push([...l.players]));
    const a = join(room);
    expect(a.got[0].msg).toEqual({ t: 'welcome', you: 'P2' });
    expect(a.got[1].msg).toMatchObject({ t: 'lobby', lobby: { players: ['P1', 'P2'] } });
    const b = join(room);
    expect(b.got[0].msg).toEqual({ t: 'welcome', you: 'P3' });
    expect(a.got.at(-1)!.msg).toMatchObject({ t: 'lobby', lobby: { players: ['P1', 'P2', 'P3'] } });
    expect(host.lobby().players).toEqual(['P1', 'P2', 'P3']);
    expect(lobbies.at(-1)).toEqual(['P1', 'P2', 'P3']);
    expect(host.label('P2')).toBe('Online');
  });

  test('hello com build diferente recebe rejected version', () => {
    const { room, host } = setup();
    const link = room.connect();
    const got = inbox(link);
    link.send('ctl', hello('outro'));
    expect(got.map((g) => g.msg)).toEqual([{ t: 'rejected', reason: 'version' }]);
    expect(host.lobby().players).toEqual(['P1']);
  });

  test('entrada depois de start recebe rejected started', () => {
    const { room, host } = setup();
    join(room);
    expect(host.start(1)).not.toBeNull();
    const late = join(room);
    expect(late.got.map((g) => g.msg)).toEqual([{ t: 'rejected', reason: 'started' }]);
    expect(host.lobby().players).toEqual(['P1', 'P2']);
  });

  test('quinto jogador recebe rejected full', () => {
    const { room } = setup();
    join(room); join(room); join(room);
    const extra = join(room);
    expect(extra.got.map((g) => g.msg)).toEqual([{ t: 'rejected', reason: 'full' }]);
  });

  test('start com 1 jogador devolve null', () => {
    const { host } = setup();
    expect(host.start(1)).toBeNull();
    expect(host.lobby().started).toBe(false);
  });

  test('start manda a config com modo, rodadas e jogadores', () => {
    const { room, host } = setup();
    const a = join(room);
    host.setOptions('points', 8);
    expect(a.got.at(-1)!.msg).toMatchObject({ t: 'lobby', lobby: { mode: 'points', rounds: 8 } });
    const config = host.start(42);
    expect(config).toEqual({ mode: 'points', rounds: 8, players: ['P1', 'P2'], seed: 42 });
    expect(a.got.at(-1)!.msg).toEqual({ t: 'start', config });
    expect(host.lobby().started).toBe(true);
    host.setOptions('survival', 12);
    expect(host.start(7)).toBeNull(); // já começou
  });

  test('modo sobrevivência não leva rodadas na config', () => {
    const { room, host } = setup();
    join(room);
    expect(host.start(3)).toEqual({ mode: 'survival', players: ['P1', 'P2'], seed: 3 });
  });

  test('mensagem lixo não derruba a conexão', () => {
    const { room, host } = setup();
    const a = join(room);
    host.start(1);
    const hooks = host.hooks();
    a.link.send('ctl', '{');
    a.link.send('ctl', JSON.stringify({ t: 'input', move: 'x' }));
    a.link.send('ctl', JSON.stringify({ t: 'input', move: { x: 0.5, z: 0 }, pushCount: 1 }));
    const inputs = hooks.remoteInputs!();
    expect(inputs.get('P2')).toEqual({ move: { x: 0.5, z: 0 }, push: true });
    expect(a.link.closed).toBe(false);
    expect(host.isConnected('P2')).toBe(true);
  });

  test('input de uma conexão só vale para o jogador dela', () => {
    const { room, host } = setup();
    join(room);
    const b = join(room);
    host.start(1);
    b.link.send('ctl', encode({ t: 'input', move: { x: 0, z: 1 }, pushCount: 0 }));
    const inputs = host.hooks().remoteInputs!();
    expect([...inputs.keys()]).toEqual(['P3']);
  });

  test('input atrasado da partida anterior não gera empurrão nem bloqueia os seguintes', () => {
    const { room, host } = setup();
    const a = join(room);
    host.start(1);
    const hooks = host.hooks();
    const input = (pushCount: number) => a.link.send('ctl', encode({ t: 'input', move: { x: 0, z: 0 }, pushCount }));
    input(5);
    hooks.remoteInputs!(); hooks.remoteInputs!(); // consome os empurrões da partida 1
    host.backToLobby();
    host.start(2);
    const nova = host.hooks();
    input(5); // heartbeat velho, chegando depois do start
    expect(nova.remoteInputs!().get('P2')?.push).toBe(false);
    input(6); // primeiro empurrão da partida 2
    expect(nova.remoteInputs!().get('P2')?.push).toBe(true);
    expect(nova.remoteInputs!().get('P2')?.push).toBe(false);
  });

  test('start zera empurrões pendentes e move de quem já estava', () => {
    const { room, host } = setup();
    const a = join(room);
    host.start(1);
    a.link.send('ctl', encode({ t: 'input', move: { x: 1, z: 0 }, pushCount: 2 }));
    host.backToLobby();
    host.start(2);
    expect(host.hooks().remoteInputs!().get('P2')).toEqual({ move: { x: 0, z: 0 }, push: false });
  });

  test('vaga reaproveitada começa a contagem do zero', () => {
    const { room, host } = setup();
    const a = join(room);
    a.link.send('ctl', encode({ t: 'input', move: { x: 0, z: 0 }, pushCount: 9 }));
    a.link.close();
    const b = join(room); // ganha P2 de novo
    host.start(1);
    b.link.send('ctl', encode({ t: 'input', move: { x: 0, z: 0 }, pushCount: 1 }));
    expect(host.hooks().remoteInputs!().get('P2')?.push).toBe(true);
  });

  test('ping recebe pong com o mesmo at', () => {
    const { room } = setup();
    const a = join(room);
    a.link.send('ctl', encode({ t: 'ping', at: 123 }));
    expect(a.got.at(-1)!.msg).toEqual({ t: 'pong', at: 123 });
  });

  test('queda no lobby libera a vaga e reenvia lobby', () => {
    const { room, host } = setup();
    const a = join(room);
    const b = join(room);
    a.link.close();
    expect(host.lobby().players).toEqual(['P1', 'P3']);
    expect(b.got.at(-1)!.msg).toMatchObject({ t: 'lobby', lobby: { players: ['P1', 'P3'] } });
    const c = join(room);
    expect(c.got[0].msg).toEqual({ t: 'welcome', you: 'P2' });
  });

  test('bye no lobby libera a vaga', () => {
    const { room, host } = setup();
    const a = join(room);
    a.link.send('ctl', encode({ t: 'bye' }));
    expect(host.lobby().players).toEqual(['P1']);
  });

  test('queda na partida: isConnected false, left enviado, jogador para', () => {
    const { room, host } = setup();
    const a = join(room);
    const b = join(room);
    host.start(1);
    const hooks = host.hooks();
    a.link.send('ctl', encode({ t: 'input', move: { x: 1, z: 0 }, pushCount: 0 }));
    expect(hooks.remoteInputs!().get('P2')?.move).toEqual({ x: 1, z: 0 });
    a.link.close();
    expect(host.isConnected('P2')).toBe(false);
    expect(host.isConnected('P3')).toBe(true);
    expect(b.got.at(-1)!.msg).toEqual({ t: 'left', id: 'P2' });
    expect(hooks.remoteInputs!().has('P2')).toBe(false);
    expect(host.lobby().players).toEqual(['P1', 'P2', 'P3']);
  });

  test('backToLobby tira quem caiu, zera started e reenvia lobby', () => {
    const { room, host } = setup();
    const a = join(room);
    const b = join(room);
    host.start(1);
    a.link.close();
    host.backToLobby();
    expect(host.lobby()).toMatchObject({ players: ['P1', 'P3'], started: false });
    expect(host.isConnected('P2')).toBe(true); // vaga livre de novo, não marca desconectado
    expect(b.got.at(-1)!.msg).toMatchObject({ t: 'lobby', lobby: { players: ['P1', 'P3'], started: false } });
  });

  test('afterFrame manda snap a cada 2 ticks e events só quando há eventos', () => {
    const { room, host } = setup();
    const a = join(room);
    const config = host.start(1)!;
    const hooks = host.hooks();
    const game = createGame(config, BANK);
    const from = a.got.length;
    const ev = [{ type: 'phaseChanged', phase: 'spin' } as const];

    hooks.afterFrame!(1, game.state, ev, ['Tema0']);
    hooks.afterFrame!(2, game.state, [], ['Tema0']);
    hooks.afterFrame!(3, game.state, [], ['Tema0']);
    hooks.afterFrame!(6, game.state, [], ['Tema0']); // quadro que avançou 3 passos

    const got = a.got.slice(from);
    const snaps = got.filter((g) => g.msg.t === 'snap');
    const events = got.filter((g) => g.msg.t === 'events');
    expect(snaps.map((g) => (g.msg as { tick: number }).tick)).toEqual([1, 3, 6]);
    expect(snaps.every((g) => g.ch === 'snap')).toBe(true);
    expect(snaps[0].msg).toMatchObject({ themes: ['Tema0'] }); // fase spin leva os temas
    expect(events.map((g) => g.msg)).toEqual([{ t: 'events', tick: 1, events: ev }]);
    expect(events[0].ch).toBe('ctl');
  });

  test('snap fora da fase spin não leva themes', () => {
    const { room, host } = setup();
    const a = join(room);
    const config = host.start(1)!;
    const game = createGame(config, BANK);
    const state = { ...game.state, phase: 'question' as const };
    host.hooks().afterFrame!(1, state, [], ['Tema0']);
    const snap = a.got.at(-1)!.msg;
    expect(snap.t).toBe('snap');
    expect('themes' in snap).toBe(false);
  });

  test('close manda closed a todos e fecha a sala', () => {
    const { room, host } = setup();
    const a = join(room);
    host.close();
    expect(a.got.at(-1)!.msg).toEqual({ t: 'closed' });
    expect(a.link.closed).toBe(true);
    expect(room.closed).toBe(true);
  });
});
