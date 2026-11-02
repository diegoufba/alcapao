import * as THREE from 'three';
import type { PlayerId, Vec2 } from '../core/types';
import { PLAYER_COLORS, flatMaterial, enableShadows } from './scene';

export type Pose = 'idle' | 'walk' | 'push' | 'fall' | 'cheer';
export interface CharacterState { pos: Vec2; facing: number; speed: number; pose: Pose; visible: boolean }
export interface Character {
  root: THREE.Group;
  update(dt: number, s: CharacterState): void;
  playFall(): void;
  playRespawnDrop(): void;
  /** Volta ao estado inicial (sem queda, sem queda de respawn, visível). */
  reset(): void;
}

const SHADES: Record<PlayerId, { dark: string; hair: string }> = {
  P1: { dark: '#2F5FC0', hair: '#4A2E1C' },
  P2: { dark: '#C45E1E', hair: '#1E1A16' },
  P3: { dark: '#22A06A', hair: '#8A5A2B' },
  P4: { dark: '#A645BB', hair: '#2B2233' },
};

const SCALE = 1.45;
const GROUND_Y = 0.1;
const FALL_TIME = 0.8, FALL_DEPTH = 3, RESPAWN_TIME = 0.5, RESPAWN_HEIGHT = 6;

export function createCharacter(id: PlayerId): Character {
  const color = PLAYER_COLORS[id];
  const { dark: shade, hair: hairColor } = SHADES[id];
  const skin = flatMaterial('#F2C9A0'), shirt = flatMaterial(color), pants = flatMaterial('#2A2F4A');
  const shoe = flatMaterial('#1A1A2E'), white = flatMaterial('#F4F5FF'), shadeMat = flatMaterial(shade);

  const root = new THREE.Group();
  const model = new THREE.Group(); // escala, inclinação e giro
  model.scale.setScalar(SCALE);
  root.add(model);

  // pernas em pivôs no quadril (y = 0,5)
  const legs: THREE.Group[] = [];
  for (const x of [-0.17, 0.17]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.5, 0);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.42, 6), pants); leg.position.y = -0.2; pivot.add(leg);
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.34), shoe); sh.position.set(0, -0.43, 0.05); pivot.add(sh);
    model.add(pivot); legs.push(pivot);
  }
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.6, 7), shirt); body.position.y = 0.78; model.add(body);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.33, 0.1, 7), white); stripe.position.y = 0.7; model.add(stripe);

  const armGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.46, 6);
  const handGeo = new THREE.IcosahedronGeometry(0.1, 0);
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(0.38 * s, 1.0, 0);
    const arm = new THREE.Mesh(armGeo, shirt); arm.position.y = -0.2; pivot.add(arm);
    const hand = new THREE.Mesh(handGeo, skin); hand.position.y = -0.46; pivot.add(hand);
    model.add(pivot); arms.push(pivot);
  }

  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), skin); head.position.y = 1.55; head.scale.set(1, 0.95, 0.95); model.add(head);
  const hair = new THREE.Mesh(new THREE.IcosahedronGeometry(0.51, 1), flatMaterial(hairColor)); hair.position.set(0, 1.6, -0.16); hair.scale.set(1.0, 0.9, 0.8); model.add(hair);
  const eyeMat = flatMaterial('#1A1A2E'), cheekMat = flatMaterial('#F29A8A');
  for (const x of [-0.17, 0.17]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.17, 0.05), eyeMat); eye.position.set(x, 1.52, 0.46); model.add(eye);
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.02), white); hl.position.set(x + 0.015, 1.57, 0.49); model.add(hl);
  }
  for (const x of [-0.3, 0.3]) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.03), cheekMat); ch.position.set(x, 1.4, 0.4); model.add(ch);
  }
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.53, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), shirt); cap.position.y = 1.7; cap.scale.y = 0.75; model.add(cap);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.535, 0.535, 0.1, 8), shadeMat); band.position.y = 1.72; model.add(band);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.07, 10, 1, false, -Math.PI / 2, Math.PI), shadeMat); brim.position.set(0, 1.69, 0.3); brim.rotation.x = 0.12; model.add(brim);
  const button = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), white); button.position.y = 2.1; model.add(button);
  enableShadows(root);

  let time = 0, walkPhase = 0;
  let fall = { state: 'none' as 'none' | 'falling' | 'gone', t: 0 };
  let drop = -1; // tempo decorrido da queda de respawn; -1 = inativo
  const armX = [0, 0], armZ = [0, 0], legX = [0, 0];

  const damp = (cur: number, target: number, dt: number): number => cur + (target - cur) * (1 - Math.exp(-18 * dt));

  return {
    root,
    playFall() { fall = { state: 'falling', t: 0 }; },
    playRespawnDrop() { fall = { state: 'none', t: 0 }; drop = 0; },
    reset() { fall = { state: 'none', t: 0 }; drop = -1; root.visible = true; root.position.y = 0; },
    update(dt, s) {
      time += dt;
      if (s.pose === 'fall' && fall.state === 'none' && drop < 0) fall = { state: 'falling', t: 0 };
      if (fall.state === 'falling') {
        fall.t += dt;
        if (fall.t >= FALL_TIME) fall.state = 'gone';
      }
      if (drop >= 0) { drop += dt; if (drop >= RESPAWN_TIME) drop = -1; }

      root.visible = s.visible && fall.state !== 'gone';
      let y = GROUND_Y, spin = 0, lean = 0, bounce = 0;
      const falling = fall.state === 'falling';
      let pose: Pose = s.pose;
      if (falling) {
        const k = Math.min(fall.t / FALL_TIME, 1);
        y -= FALL_DEPTH * k * k; spin = k * Math.PI * 4; lean = -0.3; pose = 'fall';
      }
      if (drop >= 0) { const k = drop / RESPAWN_TIME; y += RESPAWN_HEIGHT * (1 - k * k); }

      let tx = 0, tz = 0.18, lx = 0, swing = 0;
      if (pose === 'walk') {
        const k = Math.min(s.speed / 4, 1.5);
        walkPhase += dt * 8 * k;
        swing = Math.sin(walkPhase) * 0.9 * k;
        lx = swing; lean = 0.06 * k;
      } else if (pose === 'push') { tx = -Math.PI / 2.1; lean = 0.12; }
      else if (pose === 'fall') { tz = 2.4; }
      else if (pose === 'cheer') { tz = 2.7; bounce = Math.abs(Math.sin(time * 8)) * 0.12; }
      for (let i = 0; i < 2; i++) {
        const sign = i === 0 ? -1 : 1;
        const targetX = pose === 'walk' ? -swing * sign : tx;
        armX[i] = damp(armX[i], targetX, dt);
        armZ[i] = damp(armZ[i], sign * tz, dt);
        legX[i] = damp(legX[i], lx * sign, dt);
        arms[i].rotation.set(armX[i], 0, armZ[i]);
        legs[i].rotation.x = legX[i];
      }
      root.position.set(s.pos.x, y + bounce, s.pos.z);
      root.rotation.y = s.facing;
      model.rotation.set(lean, spin, 0);
    },
  };
}
