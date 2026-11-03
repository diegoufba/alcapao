import { test, expect, describe } from 'vitest';
import { createRng } from '../../src/core/rng';
import { ROOM_ALPHABET, ROOM_CODE_LENGTH, generateRoomCode, normalizeRoomCode, peerIdFor } from '../../src/net/room-code';

describe('código de sala', () => {
  test('gera 5 letras do alfabeto', () => {
    const rand = createRng(123);
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode(rand);
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      for (const ch of code) expect(ROOM_ALPHABET).toContain(ch);
    }
  });

  test('normaliza " ab-cde " → \'ABCDE\'', () => {
    expect(normalizeRoomCode(' ab-cde ')).toBe('ABCDE');
  });

  test('recusa O, I, L, dígitos, tamanho errado', () => {
    expect(normalizeRoomCode('ABCDO')).toBeNull();
    expect(normalizeRoomCode('ABC1E')).toBeNull();
    expect(normalizeRoomCode('ABCDI')).toBeNull();
    expect(normalizeRoomCode('ABCDL')).toBeNull();
    expect(normalizeRoomCode('ABCD')).toBeNull();
    expect(normalizeRoomCode('ABCDEF')).toBeNull();
  });

  test('peerIdFor', () => {
    expect(peerIdFor('ABCDE')).toBe('alcapao-ABCDE');
  });
});
