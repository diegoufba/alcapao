import { test, expect, describe } from 'vitest';
import { canJoin, joinAction, padLeaveAction } from '../../src/ui/join-logic';
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

describe('canJoin', () => {
  test('com um jogador de toque na sala, recusa teclado', () => {
    expect(canJoin(1, 'kb-wasd', true)).toBe(false);
  });
  test('com um jogador de toque na sala, recusa gamepad', () => {
    expect(canJoin(1, 'gp-0', true)).toBe(false);
  });
  test('com um jogador de toque na sala, recusa um segundo toque', () => {
    expect(canJoin(1, 'touch', true)).toBe(false);
  });
  test('toque entra só com a sala vazia', () => {
    expect(canJoin(0, 'touch', false)).toBe(true);
    expect(canJoin(1, 'touch', false)).toBe(false);
  });
  test('sem toque na sala, segue como hoje', () => {
    expect(canJoin(0, 'kb-wasd', false)).toBe(true);
    expect(canJoin(1, 'kb-wasd', false)).toBe(true);
    expect(canJoin(3, 'gp-2', false)).toBe(true);
    expect(canJoin(4, 'gp-0', false)).toBe(false);
  });
});

describe('joinAction', () => {
  test('teclado ou gamepad com só o P1 de toque na sala troca o P1', () => {
    expect(joinAction(1, 'touch', 'kb-wasd')).toBe('replace-p1');
    expect(joinAction(1, 'touch', 'gp-0')).toBe('replace-p1');
  });
  test('toque de novo com o P1 de toque é recusado', () => {
    expect(joinAction(1, 'touch', 'touch')).toBe('refuse');
  });
  test('toque com a sala vazia entra', () => {
    expect(joinAction(0, null, 'touch')).toBe('join');
  });
  test('toque com teclado já na sala é recusado', () => {
    expect(joinAction(1, 'kb-wasd', 'touch')).toBe('refuse');
  });
  test('sem toque na sala, entra até 4', () => {
    expect(joinAction(1, 'kb-wasd', 'gp-0')).toBe('join');
    expect(joinAction(4, 'kb-wasd', 'gp-3')).toBe('refuse');
  });
});
