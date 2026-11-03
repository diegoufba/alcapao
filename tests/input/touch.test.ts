import { test, expect, describe } from 'vitest';
import { TouchInput } from '../../src/input/touch';

describe('TouchInput', () => {
  test('empurrão sai em uma única leitura', () => {
    const t = new TouchInput();
    t.pressPush();
    expect(t.read().push).toBe(true);
    expect(t.read().push).toBe(false);
  });

  test('reset zera movimento e empurrão', () => {
    const t = new TouchInput();
    t.setStick({ x: 1, z: 0 });
    t.pressPush();
    t.reset();
    expect(t.read()).toEqual({ move: { x: 0, z: 0 }, push: false });
  });
});
