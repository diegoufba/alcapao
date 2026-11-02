import type { PlayerId, Vec2, Zone } from './types';

export const ARENA_HALF = 5.5;
export const PLATFORM_HALF = 2;

export const PLATFORM_CENTERS: Record<Zone, Vec2> = {
  A: { x: -2.5, z: -2.5 },
  B: { x: 2.5, z: -2.5 },
  C: { x: -2.5, z: 2.5 },
  D: { x: 2.5, z: 2.5 },
};

export const SPAWNS: Record<PlayerId, Vec2> = {
  P1: { x: -0.6, z: -0.6 },
  P2: { x: 0.6, z: -0.6 },
  P3: { x: -0.6, z: 0.6 },
  P4: { x: 0.6, z: 0.6 },
};

const ZONES: Zone[] = ['A', 'B', 'C', 'D'];

export function zoneOf(p: Vec2): Zone | null {
  for (const z of ZONES) {
    const c = PLATFORM_CENTERS[z];
    if (Math.abs(p.x - c.x) <= PLATFORM_HALF && Math.abs(p.z - c.z) <= PLATFORM_HALF) return z;
  }
  return null;
}
