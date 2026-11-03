import { test, expect, describe } from 'vitest';
import { sanitizeMove, RemoteInputs, admit } from '../../src/net/host-rules';
import { PROTOCOL_VERSION } from '../../src/net/protocol';
import type { LobbyInfo } from '../../src/net/protocol';
import type { PlayerId, Vec2 } from '../../src/core/types';

const BUILD = 'abc12345';
const hello = (protocol = PROTOCOL_VERSION, build = BUILD) => ({ protocol, build });
const lobby = (players: PlayerId[] = ['P1'], started = false): LobbyInfo => ({
  players, mode: 'survival', rounds: 8, started,
});
const PARADO: Vec2 = { x: 0, z: 0 };

describe('sanitizeMove', () => {
  test('vetor de comprimento maior que 1 é normalizado', () => {
    const v = sanitizeMove({ x: 3, z: 4 });
    expect(v.x).toBeCloseTo(0.6);
    expect(v.z).toBeCloseTo(0.8);
  });

  test('NaN vira parado', () => {
    expect(sanitizeMove({ x: NaN, z: 0 })).toEqual({ x: 0, z: 0 });
  });

  test('Infinity vira parado', () => {
    expect(sanitizeMove({ x: Infinity, z: 0 })).toEqual({ x: 0, z: 0 });
  });

  test('vetor válido dentro do círculo fica igual', () => {
    expect(sanitizeMove({ x: 0.3, z: 0 })).toEqual({ x: 0.3, z: 0 });
  });
});

describe('RemoteInputs', () => {
  test('pushCount 0→1 gera um empurrão em um passo só', () => {
    const r = new RemoteInputs();
    r.set('P2', PARADO, 1);
    expect(r.next().get('P2')?.push).toBe(true);
    expect(r.next().get('P2')?.push).toBe(false);
  });

  test('pushCount repetido não gera outro', () => {
    const r = new RemoteInputs();
    r.set('P2', PARADO, 1);
    r.next();
    r.set('P2', PARADO, 1);
    expect(r.next().get('P2')?.push).toBe(false);
  });

  test('salto de +50 fica com no máximo 2 pendentes', () => {
    const r = new RemoteInputs();
    r.set('P2', PARADO, 50);
    expect(r.next().get('P2')?.push).toBe(true);
    expect(r.next().get('P2')?.push).toBe(true);
    expect(r.next().get('P2')?.push).toBe(false);
  });

  test('pushCount menor que o último é ignorado', () => {
    const r = new RemoteInputs();
    r.set('P2', PARADO, 5);
    r.next();
    r.next();
    r.set('P2', PARADO, 3);
    r.set('P2', PARADO, 5);
    expect(r.next().get('P2')?.push).toBe(false);
  });

  test('pushCount não inteiro, negativo ou NaN não gera empurrão e não muda o move', () => {
    const r = new RemoteInputs();
    r.set('P2', { x: 1, z: 0 }, 1.5);
    r.set('P2', { x: 0, z: 1 }, -1);
    r.set('P2', { x: 0, z: -1 }, NaN);
    const entrada = r.next().get('P2');
    expect(entrada?.push).toBe(false);
    expect(entrada?.move).toEqual({ x: 0, z: -1 });
  });

  test('drop remove o jogador', () => {
    const r = new RemoteInputs();
    r.set('P2', { x: 1, z: 0 }, 0);
    r.set('P3', PARADO, 0);
    r.drop('P2');
    const mapa = r.next();
    expect(mapa.has('P2')).toBe(false);
    expect(mapa.has('P3')).toBe(true);
  });

  test('drop seguido de um novo set recomeça a contagem do 0', () => {
    const r = new RemoteInputs();
    r.set('P2', PARADO, 5);
    r.next();
    r.next();
    r.drop('P2');
    r.set('P2', PARADO, 1);
    expect(r.next().get('P2')?.push).toBe(true);
    expect(r.next().get('P2')?.push).toBe(false);
  });

  test('next devolve o último move de cada jogador que mandou input', () => {
    const r = new RemoteInputs();
    r.set('P2', { x: 1, z: 0 }, 0);
    r.set('P2', { x: 0, z: -1 }, 0);
    expect(r.next().get('P2')?.move).toEqual({ x: 0, z: -1 });
  });

  test('resetPending zera empurrões pendentes e move, mas guarda a contagem', () => {
    const r = new RemoteInputs();
    r.set('P2', { x: 1, z: 0 }, 2);
    r.resetPending();
    expect(r.next().get('P2')).toEqual({ move: { x: 0, z: 0 }, push: false });
    r.set('P2', PARADO, 2); // mesma contagem: nada novo
    expect(r.next().get('P2')?.push).toBe(false);
    r.set('P2', PARADO, 3);
    expect(r.next().get('P2')?.push).toBe(true);
  });
});

describe('admit', () => {
  test('versão diferente dá version', () => {
    expect(admit(lobby(), hello(PROTOCOL_VERSION + 1), BUILD)).toEqual({ ok: false, reason: 'version' });
    expect(admit(lobby(), hello(PROTOCOL_VERSION, 'outra'), BUILD)).toEqual({ ok: false, reason: 'version' });
  });

  test('partida iniciada dá started', () => {
    expect(admit(lobby(['P1', 'P2'], true), hello(), BUILD)).toEqual({ ok: false, reason: 'started' });
  });

  test('quatro jogadores dão full', () => {
    expect(admit(lobby(['P1', 'P2', 'P3', 'P4']), hello(), BUILD)).toEqual({ ok: false, reason: 'full' });
  });

  test('com P1 e P3 na sala, o novato recebe P2', () => {
    expect(admit(lobby(['P1', 'P3']), hello(), BUILD)).toEqual({ ok: true, id: 'P2' });
  });
});
