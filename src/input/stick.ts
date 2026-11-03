import type { Vec2 } from '../core/types';

/** Raio da base do analógico virtual, em px de tela. */
export const STICK_RADIUS = 60;
/** Fração do raio que não move o boneco. */
export const STICK_DEADZONE = 0.15;

/** Arrasto (dx, dy em px de tela) → movimento. Cima na tela (dy < 0) dá z < 0, como a tecla W. */
export function stickVector(dx: number, dy: number, radius = STICK_RADIUS, deadzone = STICK_DEADZONE): Vec2 {
  const d = Math.hypot(dx, dy);
  const dead = deadzone * radius;
  if (d <= dead) return { x: 0, z: 0 };
  const scale = Math.min(1, (d - dead) / (radius - dead)) / d;
  return { x: dx * scale + 0, z: dy * scale + 0 };
}

/** Rastreia o dedo do analógico; ignora os outros pointerIds. */
export class StickTracker {
  private id: number | null = null;
  private start = { x: 0, y: 0 };
  private dx = 0;
  private dy = 0;

  /** Só aceita se nenhum dedo está no analógico. */
  down(id: number, x: number, y: number): void {
    if (this.id !== null) return;
    this.id = id;
    this.start = { x, y };
    this.dx = 0;
    this.dy = 0;
  }

  move(id: number, x: number, y: number): void {
    if (id !== this.id) return;
    this.dx = x - this.start.x;
    this.dy = y - this.start.y;
  }

  /** Também serve para pointercancel. */
  up(id: number): void {
    if (id !== this.id) return;
    this.id = null;
    this.dx = 0;
    this.dy = 0;
  }

  vector(): Vec2 {
    return this.id === null ? { x: 0, z: 0 } : stickVector(this.dx, this.dy);
  }

  /** Centro da base, para o desenho; null sem dedo. */
  origin(): { x: number; y: number } | null {
    return this.id === null ? null : { ...this.start };
  }
}
