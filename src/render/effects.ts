import * as THREE from 'three';
import type { Vec2 } from '../core/types';
import { ACCENT } from './scene';

const LIFE = 0.4;
const BIT_COUNT = 7, STREAK_COUNT = 3;

interface Item { mesh: THREE.Mesh; vel: THREE.Vector3; base: number; age: number; material: THREE.MeshBasicMaterial }

export function createEffects(scene: THREE.Scene): { pushPuff(at: Vec2, dir: Vec2): void; update(dt: number): void } {
  const bitGeo = new THREE.IcosahedronGeometry(0.1, 0);
  const streakGeo = new THREE.BoxGeometry(0.9, 0.05, 0.05);
  const colors = ['#FFFFFF', ACCENT];
  const items: Item[] = [];

  function spawn(geo: THREE.BufferGeometry, color: string, pos: THREE.Vector3, vel: THREE.Vector3, base: number, yaw = 0): void {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true });
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.copy(pos); mesh.rotation.y = yaw; mesh.scale.setScalar(base);
    scene.add(mesh);
    items.push({ mesh, vel, base, age: 0, material });
  }

  return {
    pushPuff(at, dir) {
      const len = Math.hypot(dir.x, dir.z) || 1;
      const dx = dir.x / len, dz = dir.z / len;
      const yaw = Math.atan2(-dz, dx); // alinha o eixo X da linha com a direção
      for (let i = 0; i < BIT_COUNT; i++) {
        const pos = new THREE.Vector3(at.x + (Math.random() - 0.5) * 0.5, 1.45 + (Math.random() - 0.5) * 0.6, at.z + (Math.random() - 0.5) * 0.5);
        const vel = new THREE.Vector3((Math.random() - 0.5) * 2 + dx, Math.random() * 1.5, (Math.random() - 0.5) * 2 + dz);
        spawn(bitGeo, colors[i % 2], pos, vel, 0.8 + Math.random() * 0.8);
      }
      for (let i = 0; i < STREAK_COUNT; i++) {
        const pos = new THREE.Vector3(at.x - dx * 1.2, 1.0 + i * 0.4, at.z - dz * 1.2 + i * 0.1);
        spawn(streakGeo, '#F4F5FF', pos, new THREE.Vector3(-dx * 1.5, 0, -dz * 1.5), 1, yaw);
      }
    },
    update(dt) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.age += dt;
        if (it.age >= LIFE) {
          scene.remove(it.mesh); it.material.dispose(); items.splice(i, 1); continue;
        }
        const k = it.age / LIFE;
        it.mesh.position.addScaledVector(it.vel, dt);
        it.mesh.scale.setScalar(it.base * (1 - k));
        it.material.opacity = 1 - k;
      }
    },
  };
}
