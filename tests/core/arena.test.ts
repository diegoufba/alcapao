import { test, expect } from 'vitest';
import { zoneOf, SPAWNS } from '../../src/core/arena';

test('centro da arena é faixa neutra', () => expect(zoneOf({ x: 0, z: 0 })).toBeNull());
test('centro de cada plataforma', () => {
  expect(zoneOf({ x: -2.5, z: -2.5 })).toBe('A'); expect(zoneOf({ x: 2.5, z: -2.5 })).toBe('B');
  expect(zoneOf({ x: -2.5, z: 2.5 })).toBe('C'); expect(zoneOf({ x: 2.5, z: 2.5 })).toBe('D');
});
test('borda exata pertence à plataforma', () => expect(zoneOf({ x: 0.5, z: -2.5 })).toBe('B'));
test('faixa neutra entre plataformas', () => expect(zoneOf({ x: 0.49, z: -2.5 })).toBeNull());
test('fora da arena', () => expect(zoneOf({ x: 6, z: 0 })).toBeNull());
test('spawns ficam na faixa neutra e os bonecos (raio 0,4) não se sobrepõem', () => {
  const pts = Object.values(SPAWNS);
  for (const p of pts) expect(zoneOf(p)).toBeNull();
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      expect(Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z)).toBeGreaterThanOrEqual(2 * 0.4);
    }
  }
});
