import { test, expect, describe } from 'vitest';
import { KeyboardInput, KEY_GROUPS } from '../../src/input/keyboard';

describe('KeyboardInput', () => {
  test('grupos de teclas', () => {
    expect(KEY_GROUPS.map((g) => g.id)).toEqual(['kb-wasd', 'kb-arrows', 'kb-ijkl']);
    expect(KEY_GROUPS[2]).toMatchObject({ up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', push: 'KeyO' });
  });

  test('keyDown devolve o grupo ou null', () => {
    const kb = new KeyboardInput();
    expect(kb.keyDown('KeyW')).toBe('kb-wasd');
    expect(kb.keyDown('ArrowLeft')).toBe('kb-arrows');
    expect(kb.keyDown('KeyQ')).toBeNull();
  });

  test('só W: cima = -z', () => {
    const kb = new KeyboardInput();
    kb.keyDown('KeyW');
    expect(kb.read('kb-wasd').move).toEqual({ x: 0, z: -1 });
  });

  test('W+D é normalizado', () => {
    const kb = new KeyboardInput();
    kb.keyDown('KeyW');
    kb.keyDown('KeyD');
    const m = kb.read('kb-wasd').move;
    expect(Math.hypot(m.x, m.z)).toBeCloseTo(1, 6);
    expect(m.x).toBeGreaterThan(0);
    expect(m.z).toBeLessThan(0);
  });

  test('teclas opostas se anulam', () => {
    const kb = new KeyboardInput();
    kb.keyDown('KeyA');
    kb.keyDown('KeyD');
    expect(kb.read('kb-wasd').move).toEqual({ x: 0, z: 0 });
  });

  test('push é borda', () => {
    const kb = new KeyboardInput();
    kb.keyDown('KeyF');
    expect(kb.read('kb-wasd').push).toBe(true);
    expect(kb.read('kb-wasd').push).toBe(false);
    kb.keyDown('KeyF'); // auto-repeat do SO, ainda segurada
    expect(kb.read('kb-wasd').push).toBe(false);
    kb.keyUp('KeyF');
    kb.keyDown('KeyF');
    expect(kb.read('kb-wasd').push).toBe(true);
  });

  test('keyUp para o movimento e reset limpa tudo', () => {
    const kb = new KeyboardInput();
    kb.keyDown('ArrowDown');
    expect(kb.read('kb-arrows').move).toEqual({ x: 0, z: 1 });
    kb.keyUp('ArrowDown');
    expect(kb.read('kb-arrows').move).toEqual({ x: 0, z: 0 });
    kb.keyDown('KeyL');
    kb.keyDown('KeyO');
    kb.reset();
    expect(kb.read('kb-ijkl')).toEqual({ move: { x: 0, z: 0 }, push: false });
  });

  test('read de dispositivo que não é teclado', () => {
    expect(new KeyboardInput().read('gp-0')).toEqual({ move: { x: 0, z: 0 }, push: false });
  });
});
