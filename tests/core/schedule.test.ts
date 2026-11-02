import { test, expect, describe } from 'vitest';
import { QUESTION_TIME, PHASE_TIME, POINTS, difficultyFor } from '../../src/core/schedule';

describe('constantes', () => {
  test('tempos e pontos', () => {
    expect(QUESTION_TIME).toEqual({ 1: 15, 2: 12, 3: 10 });
    expect(PHASE_TIME).toEqual({ spin: 3, lock: 0.5, reveal: 3, reset: 1.5 });
    expect(POINTS).toEqual({ 1: 100, 2: 200, 3: 300 });
  });
});

describe('difficultyFor', () => {
  test('sobrevivência', () => {
    expect([1, 3].map((r) => difficultyFor('survival', r, null, false))).toEqual([1, 1]);
    expect([4, 7].map((r) => difficultyFor('survival', r, null, false))).toEqual([2, 2]);
    expect([8, 30].map((r) => difficultyFor('survival', r, null, false))).toEqual([3, 3]);
  });

  test('pontos com 12 rodadas', () => {
    const d = (r: number) => difficultyFor('points', r, 12, false);
    expect([d(4), d(5), d(8), d(9)]).toEqual([1, 2, 2, 3]);
  });

  test('pontos com 8 rodadas', () => {
    const d = (r: number) => difficultyFor('points', r, 8, false);
    expect([d(2), d(3), d(5), d(8)]).toEqual([1, 2, 3, 3]);
  });

  test('pontos com 16 rodadas', () => {
    const d = (r: number) => difficultyFor('points', r, 16, false);
    expect([d(5), d(6), d(10), d(11), d(16)]).toEqual([1, 2, 2, 3, 3]);
  });

  test('morte súbita é sempre 3', () => {
    expect(difficultyFor('points', 1, 12, true)).toBe(3);
    expect(difficultyFor('survival', 1, null, true)).toBe(3);
  });
});
