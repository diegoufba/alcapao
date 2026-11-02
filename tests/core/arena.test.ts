import { test, expect } from 'vitest';
import { zoneOf } from '../../src/core/arena';

test('centro da arena é faixa neutra', () => expect(zoneOf({ x: 0, z: 0 })).toBeNull());
test('centro de cada plataforma', () => {
  expect(zoneOf({ x: -2.5, z: -2.5 })).toBe('A'); expect(zoneOf({ x: 2.5, z: -2.5 })).toBe('B');
  expect(zoneOf({ x: -2.5, z: 2.5 })).toBe('C'); expect(zoneOf({ x: 2.5, z: 2.5 })).toBe('D');
});
test('borda exata pertence à plataforma', () => expect(zoneOf({ x: 0.5, z: -2.5 })).toBe('B'));
test('faixa neutra entre plataformas', () => expect(zoneOf({ x: 0.49, z: -2.5 })).toBeNull());
test('fora da arena', () => expect(zoneOf({ x: 6, z: 0 })).toBeNull());
