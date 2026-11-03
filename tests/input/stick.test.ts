import { test, expect, describe } from 'vitest';
import { StickTracker, stickVector } from '../../src/input/stick';

describe('stickVector', () => {
  test('dentro da zona morta é parado', () => {
    expect(stickVector(5, 0)).toEqual({ x: 0, z: 0 });
  });

  test('arrastar para cima dá z negativo', () => {
    expect(stickVector(0, -60).z).toBe(-1);
  });

  test('fica limitado a 1', () => {
    expect(Math.hypot(...Object.values(stickVector(300, 300)))).toBeCloseTo(1);
  });

  test('proporcional entre a zona morta e o raio', () => {
    expect(stickVector(34.5, 0).x).toBeCloseTo(0.5);
  });
});

describe('StickTracker', () => {
  test('segundo dedo não rouba o analógico', () => {
    const s = new StickTracker();
    s.down(1, 0, 0);
    s.down(2, 100, 0);
    s.move(2, 200, 0);
    expect(s.vector()).toEqual({ x: 0, z: 0 });
  });

  test('soltar outro dedo não zera o analógico', () => {
    const s = new StickTracker();
    s.down(1, 0, 0);
    s.move(1, 60, 0);
    s.up(2);
    expect(s.vector().x).toBe(1);
  });

  test('up do dedo do analógico zera', () => {
    const s = new StickTracker();
    s.down(1, 0, 0);
    s.move(1, 60, 0);
    s.up(1);
    expect(s.vector()).toEqual({ x: 0, z: 0 });
    expect(s.origin()).toBeNull();
  });
});
