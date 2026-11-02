import type { Difficulty, Mode } from './types';

export const QUESTION_TIME: Record<Difficulty, number> = { 1: 15, 2: 12, 3: 10 };
export const PHASE_TIME = { spin: 3, lock: 0.5, reveal: 3, reset: 1.5 };
export const POINTS: Record<Difficulty, number> = { 1: 100, 2: 200, 3: 300 };

export function difficultyFor(
  mode: Mode,
  round: number,
  totalRounds: number | null,
  suddenDeath: boolean,
): Difficulty {
  if (suddenDeath) return 3;
  if (mode === 'survival' || totalRounds === null) {
    if (round <= 3) return 1;
    if (round <= 7) return 2;
    return 3;
  }
  const third = Math.floor(totalRounds / 3);
  if (round <= third) return 1;
  if (round <= 2 * third) return 2;
  return 3;
}
