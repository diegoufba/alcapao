import { test, expect, describe } from 'vitest';
import { anyDeviceInput } from '../../src/input/any-input';
import { GamepadInput, type PadLike } from '../../src/input/gamepad';
import { KeyboardInput } from '../../src/input/keyboard';
import type { HudSlots } from '../../src/input/match-input';

const slots: HudSlots = { label: () => 'Você', isConnected: () => true };

function pad(index: number, o: { axes?: number[]; pressed?: number[] } = {}): PadLike {
  const pressed = new Set(o.pressed ?? []);
  return {
    index,
    connected: true,
    axes: o.axes ?? [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.has(i) })),
  };
}

describe('anyDeviceInput', () => {
  test('qualquer grupo de teclado move o jogador local', () => {
    const kb = new KeyboardInput();
    const input = anyDeviceInput('P2', kb, new GamepadInput(), slots);
    kb.keyDown('ArrowLeft');
    const out = input.read();
    expect([...out.keys()]).toEqual(['P2']);
    expect(out.get('P2')).toEqual({ move: { x: -1, z: 0 }, push: false });
  });

  test('o empurrão de qualquer grupo vale uma vez', () => {
    const kb = new KeyboardInput();
    const input = anyDeviceInput('P1', kb, new GamepadInput(), slots);
    kb.keyDown('KeyF');
    expect(input.read().get('P1')?.push).toBe(true);
    expect(input.read().get('P1')?.push).toBe(false);
  });

  test('gamepad conectado também conta, e o empurrão é o OU de todos', () => {
    const kb = new KeyboardInput();
    const gp = new GamepadInput();
    const input = anyDeviceInput('P3', kb, gp, slots);
    gp.poll([pad(1, { axes: [0, 1], pressed: [0] })]);
    kb.keyDown('KeyO');
    expect(input.read().get('P3')).toEqual({ move: { x: 0, z: 1 }, push: true });
    // os dois empurrões foram consumidos na mesma leitura
    expect(input.read().get('P3')?.push).toBe(false);
  });

  test('repassa label e isConnected do HudSlots', () => {
    const input = anyDeviceInput('P1', new KeyboardInput(), new GamepadInput(), { label: (p) => `L${p}`, isConnected: (p) => p === 'P1' });
    expect(input.label('P2')).toBe('LP2');
    expect(input.isConnected('P2')).toBe(false);
  });
});

describe('GamepadInput.connectedIds', () => {
  test('lista só os pads conectados', () => {
    const gp = new GamepadInput();
    gp.poll([pad(0), pad(2)]);
    expect(gp.connectedIds()).toEqual(['gp-0', 'gp-2']);
    gp.poll([pad(2)]);
    expect(gp.connectedIds()).toEqual(['gp-2']);
  });
});
