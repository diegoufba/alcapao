import type { PlayerInput, Vec2 } from '../core/types';

/** Entrada de toque sem DOM: o analógico define o movimento; o empurrão vale até a próxima leitura. */
export class TouchInput {
  private move: Vec2 = { x: 0, z: 0 };
  private pendingPush = false;

  setStick(v: Vec2): void {
    this.move = { x: v.x, z: v.z };
  }

  pressPush(): void {
    this.pendingPush = true;
  }

  /** `push` é true só na primeira leitura depois de apertar. */
  read(): PlayerInput {
    const push = this.pendingPush;
    this.pendingPush = false;
    return { move: { ...this.move }, push };
  }

  reset(): void {
    this.move = { x: 0, z: 0 };
    this.pendingPush = false;
  }
}
