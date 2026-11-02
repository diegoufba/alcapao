import { test, expect, describe } from 'vitest';
import { padLeaveAction } from '../../src/ui/join-logic';
import { DeviceSlots } from '../../src/input/devices';

function slots(): DeviceSlots {
  const s = new DeviceSlots();
  s.join('gp-0'); // P1
  s.join('gp-1'); // P2
  s.join('kb-wasd'); // P3
  return s;
}

describe('padLeaveAction', () => {
  test('B do pad de P1 volta ao menu', () => {
    expect(padLeaveAction(slots(), 'gp-0', 'back')).toEqual({ type: 'menu' });
  });
  test('B de pad que não entrou volta ao menu', () => {
    expect(padLeaveAction(slots(), 'gp-3', 'back')).toEqual({ type: 'menu' });
  });
  test('B de outro pad já dentro remove só a vaga dele', () => {
    expect(padLeaveAction(slots(), 'gp-1', 'back')).toEqual({ type: 'leave', player: 'P2' });
  });
  test('Select de outro pad dentro remove a vaga dele; de P1 ou de pad fora não faz nada', () => {
    const s = slots();
    expect(padLeaveAction(s, 'gp-1', 'select')).toEqual({ type: 'leave', player: 'P2' });
    expect(padLeaveAction(s, 'gp-0', 'select')).toEqual({ type: 'none' });
    expect(padLeaveAction(s, 'gp-3', 'select')).toEqual({ type: 'none' });
  });
});
