import { test, expect, describe } from 'vitest';
import { createTouchMode } from '../../src/input/touch-mode';

function touchDown(target: EventTarget, pointerType: string): void {
  target.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType }));
}

/** Tecla cujo `target` é um elemento com o `tagName` dado (como um campo de texto focado). */
function keyFrom(target: EventTarget, tagName: string): void {
  const evt = new Event('keydown');
  Object.defineProperty(evt, 'target', { value: Object.assign(new EventTarget(), { tagName }) });
  target.dispatchEvent(evt);
}

function fakeRoot() {
  const calls: Array<[string, boolean]> = [];
  return {
    calls,
    root: { classList: { toggle(c: string, on: boolean) { calls.push([c, on]); } } },
  };
}

describe('createTouchMode', () => {
  test('toque liga', () => {
    const target = new EventTarget();
    const { root } = fakeRoot();
    const mode = createTouchMode(target, root);
    expect(mode.isOn()).toBe(false);
    touchDown(target, 'touch');
    expect(mode.isOn()).toBe(true);
  });

  test('mouse não liga', () => {
    const target = new EventTarget();
    const { root } = fakeRoot();
    const mode = createTouchMode(target, root);
    touchDown(target, 'mouse');
    expect(mode.isOn()).toBe(false);
  });

  test('tecla desliga', () => {
    const target = new EventTarget();
    const { root } = fakeRoot();
    const mode = createTouchMode(target, root);
    touchDown(target, 'touch');
    target.dispatchEvent(new Event('keydown'));
    expect(mode.isOn()).toBe(false);
  });

  test('tecla digitada num campo de texto não desliga', () => {
    const target = new EventTarget();
    const { root } = fakeRoot();
    const mode = createTouchMode(target, root);
    touchDown(target, 'touch');
    keyFrom(target, 'INPUT');
    keyFrom(target, 'TEXTAREA');
    expect(mode.isOn()).toBe(true);
  });

  test('setOff desliga', () => {
    const target = new EventTarget();
    const { root } = fakeRoot();
    const mode = createTouchMode(target, root);
    touchDown(target, 'touch');
    mode.setOff();
    expect(mode.isOn()).toBe(false);
  });

  test('onChange só dispara quando muda', () => {
    const target = new EventTarget();
    const { root } = fakeRoot();
    const mode = createTouchMode(target, root);
    const seen: boolean[] = [];
    mode.onChange((on) => seen.push(on));
    touchDown(target, 'touch');
    touchDown(target, 'touch');
    target.dispatchEvent(new Event('keydown'));
    target.dispatchEvent(new Event('keydown'));
    mode.setOff();
    expect(seen).toEqual([true, false]);
  });

  test('onChange aceita vários callbacks', () => {
    const target = new EventTarget();
    const { root } = fakeRoot();
    const mode = createTouchMode(target, root);
    const a: boolean[] = [];
    const b: boolean[] = [];
    mode.onChange((on) => a.push(on));
    mode.onChange((on) => b.push(on));
    touchDown(target, 'touch');
    expect(a).toEqual([true]);
    expect(b).toEqual([true]);
  });

  test('root recebe is-touch', () => {
    const target = new EventTarget();
    const { root, calls } = fakeRoot();
    createTouchMode(target, root);
    touchDown(target, 'touch');
    target.dispatchEvent(new Event('keydown'));
    expect(calls).toEqual([['is-touch', true], ['is-touch', false]]);
  });
});
