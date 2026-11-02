import { test, expect, describe } from 'vitest';
import { DeviceSlots } from '../../src/input/devices';

describe('DeviceSlots', () => {
  test('join duas vezes devolve o mesmo slot', () => {
    const s = new DeviceSlots();
    expect(s.join('kb-wasd')).toBe('P1');
    expect(s.join('kb-wasd')).toBe('P1');
    expect(s.players()).toHaveLength(1);
  });

  test('quatro ocupam P1-P4 e o quinto recebe null', () => {
    const s = new DeviceSlots();
    expect(s.join('kb-wasd')).toBe('P1');
    expect(s.join('kb-arrows')).toBe('P2');
    expect(s.join('gp-0')).toBe('P3');
    expect(s.join('gp-1')).toBe('P4');
    expect(s.join('kb-ijkl')).toBeNull();
    expect(s.players()).toEqual(['P1', 'P2', 'P3', 'P4']);
  });

  test('slotOf e deviceOf', () => {
    const s = new DeviceSlots();
    s.join('kb-arrows');
    expect(s.slotOf('kb-arrows')).toBe('P1');
    expect(s.deviceOf('P1')).toBe('kb-arrows');
    expect(s.slotOf('gp-0')).toBeNull();
    expect(s.deviceOf('P2')).toBeNull();
  });

  test('leave libera e o próximo join pega o menor slot livre', () => {
    const s = new DeviceSlots();
    s.join('kb-wasd');
    s.join('kb-arrows');
    s.join('gp-0');
    s.leave('P2');
    expect(s.slotOf('kb-arrows')).toBeNull();
    expect(s.players()).toEqual(['P1', 'P3']);
    expect(s.join('gp-1')).toBe('P2');
  });

  test('desconectar mantém o slot; reconectar não muda', () => {
    const s = new DeviceSlots();
    s.join('gp-0');
    expect(s.isConnected('P1')).toBe(true);
    s.setConnected('gp-0', false);
    expect(s.isConnected('P1')).toBe(false);
    expect(s.slotOf('gp-0')).toBe('P1');
    s.setConnected('gp-0', true);
    expect(s.isConnected('P1')).toBe(true);
    expect(s.slotOf('gp-0')).toBe('P1');
  });

  test('isConnected de slot vazio e setConnected de dispositivo sem slot', () => {
    const s = new DeviceSlots();
    expect(s.isConnected('P1')).toBe(false);
    s.setConnected('gp-5', false);
    expect(s.players()).toEqual([]);
  });

  test('leave volta a conectado para quem entra depois', () => {
    const s = new DeviceSlots();
    s.join('gp-0');
    s.setConnected('gp-0', false);
    s.leave('P1');
    s.join('gp-1');
    expect(s.isConnected('P1')).toBe(true);
  });
});
