import type { PlayerInput, Vec2 } from '../core/types';

export type DeviceId = 'kb-wasd' | 'kb-arrows' | 'kb-ijkl' | `gp-${number}`;

export const KEY_GROUPS: { id: DeviceId; up: string; down: string; left: string; right: string; push: string }[] = [
  { id: 'kb-wasd', up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', push: 'KeyF' },
  { id: 'kb-arrows', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', push: 'ShiftRight' },
  { id: 'kb-ijkl', up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', push: 'KeyO' },
];

/** Normaliza para comprimento 1 (sem -0). */
export function normalizeMove(x: number, z: number): Vec2 {
  const len = Math.hypot(x, z);
  if (len === 0) return { x: 0, z: 0 };
  return { x: x / len + 0, z: z / len + 0 };
}

/** Teclado sem DOM: alimentado com códigos de tecla (KeyboardEvent.code). Cima = -z. */
export class KeyboardInput {
  private held = new Set<string>();
  private pendingPush = new Set<DeviceId>();

  /** Devolve o grupo dono da tecla, ou null se ela não pertence a nenhum. */
  keyDown(code: string): DeviceId | null {
    const group = KEY_GROUPS.find((g) => g.up === code || g.down === code || g.left === code || g.right === code || g.push === code);
    if (!group) return null;
    if (code === group.push && !this.held.has(code)) this.pendingPush.add(group.id);
    this.held.add(code);
    return group.id;
  }

  keyUp(code: string): void {
    this.held.delete(code);
  }

  /** Movimento atual; `push` é true só na primeira leitura depois de apertar. */
  read(id: DeviceId): PlayerInput {
    const g = KEY_GROUPS.find((k) => k.id === id);
    if (!g) return { move: { x: 0, z: 0 }, push: false };
    const h = (c: string) => (this.held.has(c) ? 1 : 0);
    const move = normalizeMove(h(g.right) - h(g.left), h(g.down) - h(g.up));
    const push = this.pendingPush.delete(id);
    return { move, push };
  }

  reset(): void {
    this.held.clear();
    this.pendingPush.clear();
  }
}
