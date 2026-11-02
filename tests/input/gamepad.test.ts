import { test, expect, describe } from 'vitest';
import { DeviceSlots } from '../../src/input/devices';
import { GamepadInput, type PadLike } from '../../src/input/gamepad';

function pad(index: number, o: { axes?: number[]; pressed?: number[]; connected?: boolean } = {}): PadLike {
  const pressed = new Set(o.pressed ?? []);
  return {
    index,
    connected: o.connected ?? true,
    axes: o.axes ?? [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.has(i) })),
  };
}

describe('GamepadInput', () => {
  test('zona morta', () => {
    const g = new GamepadInput();
    g.poll([pad(0, { axes: [0.1, 0] })]);
    expect(g.read('gp-0').move).toEqual({ x: 0, z: 0 });
  });

  test('analógico cheio e eixo 1 positivo = +z', () => {
    const g = new GamepadInput();
    g.poll([pad(0, { axes: [1, 0] })]);
    expect(g.read('gp-0').move).toEqual({ x: 1, z: 0 });
    g.poll([pad(0, { axes: [0, 1] })]);
    expect(g.read('gp-0').move).toEqual({ x: 0, z: 1 });
  });

  test('analógico é limitado a comprimento 1', () => {
    const g = new GamepadInput();
    g.poll([pad(0, { axes: [1, 1] })]);
    const m = g.read('gp-0').move;
    expect(Math.hypot(m.x, m.z)).toBeCloseTo(1, 6);
  });

  test('D-pad quando analógico em repouso', () => {
    const g = new GamepadInput();
    g.poll([pad(0, { pressed: [14] })]);
    expect(g.read('gp-0').move).toEqual({ x: -1, z: 0 });
    g.poll([pad(0, { pressed: [12, 15] })]);
    const m = g.read('gp-0').move;
    expect(Math.hypot(m.x, m.z)).toBeCloseTo(1, 6);
    expect(m.z).toBeLessThan(0);
    expect(m.x).toBeGreaterThan(0);
  });

  test('analógico tem prioridade sobre o D-pad', () => {
    const g = new GamepadInput();
    g.poll([pad(0, { axes: [0, 1], pressed: [14] })]);
    expect(g.read('gp-0').move).toEqual({ x: 0, z: 1 });
  });

  test('push é borda por pad', () => {
    const g = new GamepadInput();
    g.poll([pad(0), pad(1)]);
    g.poll([pad(0, { pressed: [0] }), pad(1)]);
    expect(g.read('gp-0').push).toBe(true);
    expect(g.read('gp-0').push).toBe(false);
    expect(g.read('gp-1').push).toBe(false);
    g.poll([pad(0, { pressed: [0] }), pad(1)]); // segurado
    expect(g.read('gp-0').push).toBe(false);
    g.poll([pad(0), pad(1)]);
    g.poll([pad(0, { pressed: [0] }), pad(1)]);
    expect(g.read('gp-0').push).toBe(true);
  });

  test('joined só com botão apertado; segurar não reemite', () => {
    const g = new GamepadInput();
    expect(g.poll([pad(0)]).joined).toEqual([]);
    expect(g.poll([pad(0, { pressed: [3] })]).joined).toEqual(['gp-0']);
    expect(g.poll([pad(0, { pressed: [3] })]).joined).toEqual([]);
  });

  test('joined reaparece em novo aperto (reentrada após leave)', () => {
    const g = new GamepadInput();
    const slots = new DeviceSlots();
    for (const id of g.poll([pad(0, { pressed: [0] })]).joined) slots.join(id);
    expect(slots.slotOf('gp-0')).toBe('P1');
    slots.leave('P1');
    g.poll([pad(0)]);
    const again = g.poll([pad(0, { pressed: [1] })]).joined;
    expect(again).toEqual(['gp-0']);
    expect(slots.join(again[0])).toBe('P1');
  });

  test('reset descarta push pendente', () => {
    const g = new GamepadInput();
    g.poll([pad(0, { pressed: [0] })]);
    g.reset();
    expect(g.read('gp-0').push).toBe(false);
  });

  test('disconnected e reconnected', () => {
    const g = new GamepadInput();
    g.poll([pad(0, { pressed: [0] })]);
    expect(g.poll([null]).disconnected).toEqual(['gp-0']);
    expect(g.read('gp-0')).toEqual({ move: { x: 0, z: 0 }, push: false });
    expect(g.poll([null]).disconnected).toEqual([]);
    const r = g.poll([pad(0, { pressed: [0] })]);
    expect(r.reconnected).toEqual(['gp-0']);
    expect(r.joined).toEqual([]);
  });

  test('connected=false conta como desconectado', () => {
    const g = new GamepadInput();
    g.poll([pad(2)]);
    expect(g.poll([null, null, pad(2, { connected: false })]).disconnected).toEqual(['gp-2']);
  });

  test('read de dispositivo desconhecido', () => {
    expect(new GamepadInput().read('gp-3')).toEqual({ move: { x: 0, z: 0 }, push: false });
    expect(new GamepadInput().read('kb-wasd')).toEqual({ move: { x: 0, z: 0 }, push: false });
  });
});
