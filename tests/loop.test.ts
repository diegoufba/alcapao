import { test, expect, describe } from 'vitest';
import { createStepper } from '../src/loop';

describe('createStepper', () => {
  test('advance(1/60) dá 1 passo', () => {
    expect(createStepper().advance(1 / 60).steps).toBe(1);
  });
  test('advance(0.01) duas vezes: 0 passos e depois 1', () => {
    const s = createStepper();
    expect(s.advance(0.01).steps).toBe(0);
    expect(s.advance(0.01).steps).toBe(1);
  });
  test('advance(5) é limitado a 0,25 s: 15 passos', () => {
    expect(createStepper().advance(5).steps).toBe(15);
  });
  test('alpha sempre em [0, 1)', () => {
    const s = createStepper();
    for (const dt of [0.001, 0.016, 1 / 60, 0.0333, 0.2, 5, 0, 0.0167]) {
      const { alpha } = s.advance(dt);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });
});
