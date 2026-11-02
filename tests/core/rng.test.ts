import { test, expect } from 'vitest';
import { createRng, shuffle } from '../../src/core/rng';

test('mesma semente, mesma sequência', () => {
  const a = createRng(42), b = createRng(42);
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
});
test('valores em [0,1)', () => {
  const r = createRng(1);
  for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
});
test('shuffle preserva elementos e não muta', () => {
  const src = [1, 2, 3, 4]; const out = shuffle(src, createRng(7));
  expect([...out].sort()).toEqual([1, 2, 3, 4]); expect(src).toEqual([1, 2, 3, 4]);
});
