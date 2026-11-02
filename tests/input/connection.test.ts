import { test, expect, describe } from 'vitest';
import { applyPadChanges, pruneDisconnected } from '../../src/input/connection';
import { DeviceSlots } from '../../src/input/devices';

function slots(): DeviceSlots {
  const s = new DeviceSlots();
  s.join('kb-wasd');
  s.join('gp-0');
  return s;
}

describe('applyPadChanges', () => {
  test('partida: desconectar marca offline, mantém a vaga e emite saiu', () => {
    const s = slots();
    expect(applyPadChanges(s, { disconnected: ['gp-0'], reconnected: [] }, 'match')).toEqual(['saiu']);
    expect(s.slotOf('gp-0')).toBe('P2');
    expect(s.isConnected('P2')).toBe(false);
    expect(s.isConnected('P1')).toBe(true);
  });

  test('partida: reconectar volta ao mesmo slot e emite entrou', () => {
    const s = slots();
    applyPadChanges(s, { disconnected: ['gp-0'], reconnected: [] }, 'match');
    expect(applyPadChanges(s, { disconnected: [], reconnected: ['gp-0'] }, 'match')).toEqual(['entrou']);
    expect(s.slotOf('gp-0')).toBe('P2');
    expect(s.isConnected('P2')).toBe(true);
  });

  test('partida: pad sem vaga é ignorado', () => {
    const s = slots();
    expect(applyPadChanges(s, { disconnected: ['gp-3'], reconnected: ['gp-4'] }, 'match')).toEqual([]);
    expect(s.players()).toEqual(['P1', 'P2']);
  });

  test('entrada: desconectar libera a vaga; reconectar não entra sozinho', () => {
    const s = slots();
    expect(applyPadChanges(s, { disconnected: ['gp-0'], reconnected: [] }, 'join')).toEqual(['saiu']);
    expect(s.players()).toEqual(['P1']);
    expect(applyPadChanges(s, { disconnected: [], reconnected: ['gp-0'] }, 'join')).toEqual([]);
    expect(s.players()).toEqual(['P1']);
  });

  test('outras telas: nada muda', () => {
    const s = slots();
    expect(applyPadChanges(s, { disconnected: ['gp-0'], reconnected: [] }, 'results')).toEqual([]);
    expect(s.isConnected('P2')).toBe(true);
  });
});

describe('pruneDisconnected', () => {
  test('remove pads desconectados, mantém teclado e pads presentes (remarcados online)', () => {
    const s = slots();
    s.join('gp-1');
    s.setConnected('gp-1', false);
    const ev = pruneDisconnected(s, (d) => d === 'gp-1');
    expect(ev).toEqual(['saiu']);
    expect(s.players()).toEqual(['P1', 'P3']);
    expect(s.deviceOf('P3')).toBe('gp-1');
    expect(s.isConnected('P3')).toBe(true);
  });
});
