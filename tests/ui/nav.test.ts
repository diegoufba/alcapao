import { test, expect, describe } from 'vitest';
import { PadNav, pickInDirection, type Rect } from '../../src/ui/nav';
import type { PadLike } from '../../src/input/gamepad';

const r = (left: number, top: number, w = 100, h = 40): Rect => ({ left, top, width: w, height: h });

function pad(over: { buttons?: number[]; axes?: number[] } = {}, index = 0): PadLike {
  const buttons = Array.from({ length: 16 }, (_, i) => ({ pressed: over.buttons?.includes(i) ?? false }));
  return { index, connected: true, buttons, axes: over.axes ?? [0, 0, 0, 0] };
}

describe('pickInDirection', () => {
  const list = [r(0, 0), r(0, 60), r(0, 120), r(200, 60)];
  test('desce e sobe numa coluna', () => {
    expect(pickInDirection(list[0], list, 'down', 0)).toBe(1);
    expect(pickInDirection(list[1], list, 'down', 1)).toBe(2);
    expect(pickInDirection(list[2], list, 'up', 2)).toBe(1);
  });
  test('lateral escolhe o vizinho da mesma linha', () => {
    expect(pickInDirection(list[1], list, 'right', 1)).toBe(3);
    expect(pickInDirection(list[3], list, 'left', 3)).toBe(1);
  });
  test('sem vizinho na direção devolve -1', () => {
    expect(pickInDirection(list[0], list, 'up', 0)).toBe(-1);
    expect(pickInDirection(list[2], list, 'down', 2)).toBe(-1);
  });
});

describe('PadNav', () => {
  test('D-pad dispara na borda e repete a cada 250 ms', () => {
    const n = new PadNav();
    expect(n.poll([pad()], 0)).toEqual([]);
    expect(n.poll([pad({ buttons: [13] })], 10)).toEqual([{ pad: 0, kind: 'down' }]);
    expect(n.poll([pad({ buttons: [13] })], 200)).toEqual([]);
    expect(n.poll([pad({ buttons: [13] })], 260)).toEqual([{ pad: 0, kind: 'down' }]);
    expect(n.poll([pad()], 300)).toEqual([]);
    expect(n.poll([pad({ buttons: [13] })], 310)).toEqual([{ pad: 0, kind: 'down' }]);
  });
  test('analógico acima de 0,5 conta como direção', () => {
    const n = new PadNav();
    n.poll([pad()], 0);
    expect(n.poll([pad({ axes: [0.3, 0] })], 10)).toEqual([]);
    expect(n.poll([pad({ axes: [0.8, 0] })], 20)).toEqual([{ pad: 0, kind: 'right' }]);
  });
  test('A, B, Select e Start disparam só na borda de subida', () => {
    const n = new PadNav();
    n.poll([pad()], 0);
    expect(n.poll([pad({ buttons: [0] })], 10)).toEqual([{ pad: 0, kind: 'confirm' }]);
    expect(n.poll([pad({ buttons: [0] })], 20)).toEqual([]);
    expect(n.poll([pad({ buttons: [1, 8, 9] })], 30).map((e) => e.kind).sort()).toEqual(['back', 'select', 'start']);
  });
  test('pad que acabou de aparecer com botão apertado não dispara', () => {
    const n = new PadNav();
    expect(n.poll([pad({ buttons: [0, 14] })], 0)).toEqual([]);
    expect(n.poll([pad({ buttons: [0, 14] })], 400)).toEqual([]);
  });
});
