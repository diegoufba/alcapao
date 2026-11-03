import { test, expect, describe } from 'vitest';
import { DeviceSlots } from '../../src/input/devices';
import { GamepadInput } from '../../src/input/gamepad';
import { KeyboardInput } from '../../src/input/keyboard';
import { deviceInput } from '../../src/input/match-input';
import { TouchInput } from '../../src/input/touch';
import { deviceLabel } from '../../src/ui/hud';

describe('deviceInput', () => {
  test('deviceInput lê o toque para o slot com dispositivo touch', () => {
    const devices = new DeviceSlots();
    devices.join('touch');
    const touch = new TouchInput();
    touch.setStick({ x: 0, z: -1 });
    touch.pressPush();
    const input = deviceInput(devices, new KeyboardInput(), new GamepadInput(), touch);
    expect(input.read().get('P1')).toEqual({ move: { x: 0, z: -1 }, push: true });
    expect(input.label('P1')).toBe('Toque');
  });

  test('sem TouchInput o slot touch fica parado', () => {
    const devices = new DeviceSlots();
    devices.join('touch');
    const input = deviceInput(devices, new KeyboardInput(), new GamepadInput());
    expect(input.read().get('P1')).toEqual({ move: { x: 0, z: 0 }, push: false });
  });

  test('deviceLabel de touch é Toque', () => {
    expect(deviceLabel('touch')).toBe('Toque');
  });
});
