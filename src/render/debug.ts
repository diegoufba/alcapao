import * as THREE from 'three';
import type { GameState } from '../core/types';
import { zoneOf } from '../core/arena';
import { RADIUS } from '../core/physics';
import { ACCENT } from './scene';

interface TextSprite { sprite: THREE.Sprite; set(text: string): void }

function createTextSprite(color: string, scale: number): TextSprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(scale * 4, scale, 1);
  sprite.renderOrder = 10;
  let shown = '';
  return {
    sprite,
    set(text: string): void {
      if (text === shown || !ctx) return;
      shown = text;
      ctx.clearRect(0, 0, 512, 128);
      ctx.fillStyle = color; ctx.font = 'bold 72px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 256, 64);
      texture.needsUpdate = true;
    },
  };
}

export function createDebug(scene: THREE.Scene): { setVisible(b: boolean): void; update(state: GameState): void } {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const ringGeo = new THREE.RingGeometry(RADIUS - 0.03, RADIUS, 32).rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', depthTest: false, transparent: true });
  const answer = createTextSprite(ACCENT, 0.9);
  answer.sprite.position.set(0, 4, 0);
  group.add(answer.sprite);

  const perPlayer = new Map<string, { ring: THREE.Mesh; label: TextSprite }>();

  function entry(id: string): { ring: THREE.Mesh; label: TextSprite } {
    let e = perPlayer.get(id);
    if (!e) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.renderOrder = 10;
      const label = createTextSprite('#FFFFFF', 0.8);
      group.add(ring, label.sprite);
      e = { ring, label };
      perPlayer.set(id, e);
    }
    return e;
  }

  function update(state: GameState): void {
    for (const p of state.players) {
      const e = entry(p.id);
      e.ring.visible = e.label.sprite.visible = p.inPlay;
      if (!p.inPlay) continue;
      e.ring.position.set(p.pos.x, 0.25, p.pos.z);
      e.label.sprite.position.set(p.pos.x, 2.9, p.pos.z);
      e.label.set(zoneOf(p.pos) ?? '—');
    }
    answer.sprite.visible = state.question !== null;
    if (state.question) answer.set(`Resposta: ${state.question.correct}`);
  }

  return { setVisible(b: boolean): void { group.visible = b; }, update };
}
