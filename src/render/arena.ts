import * as THREE from 'three';
import type { Zone } from '../core/types';
import { ARENA_HALF, PLATFORM_CENTERS } from '../core/arena';
import { INK, ZONE_STYLE, drawZoneShape, flatMaterial } from './scene';

const ZONES: Zone[] = ['A', 'B', 'C', 'D'];
const DOOR_OPEN_ANGLE = 1.25;
const DOOR_OPEN_TIME = 0.4;

/** Clareia uma cor #RRGGBB em direção ao branco (t = 0..1). */
function lighten(hex: string, t: number): string {
  const c = new THREE.Color(hex).lerp(new THREE.Color('#FFFFFF'), t);
  return `#${c.getHexString()}`;
}

/** Topo da plataforma: cor da zona, contorno escuro e a forma branca no centro. A correta ganha brilho e borda branca. */
function platformTexture(zone: Zone, highlighted: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (!ctx) return texture;
  ctx.fillStyle = INK; ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = highlighted ? lighten(ZONE_STYLE[zone].color, 0.12) : ZONE_STYLE[zone].color;
  ctx.fillRect(30, 30, 452, 452);
  if (highlighted) { ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 18; ctx.strokeRect(48, 48, 416, 416); }
  drawZoneShape(ctx, zone, 256, 262, 200);
  return texture;
}

/** Piso da arena: listras lilás, como no menu. */
function floorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (!ctx) return texture;
  const stripes = 11;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? '#B9A2F7' : '#C9B6FF';
    ctx.fillRect((i * 512) / stripes, 0, 512 / stripes + 1, 512);
  }
  return texture;
}

interface PlatformParts {
  tile: THREE.Mesh;
  topMaterials: { normal: THREE.MeshLambertMaterial; highlight: THREE.MeshLambertMaterial };
  pit: THREE.Mesh;
  hinges: { pivot: THREE.Group; side: number }[];
}

export function createArena(scene: THREE.Scene): {
  setRevealed(correct: Zone | null, holes: Zone[]): void; reset(): void; update(dt: number): void;
} {
  const size = ARENA_HALF * 2;
  const base = new THREE.Mesh(new THREE.BoxGeometry(size + 1.2, 1.2, size + 1.2), flatMaterial('#E8C98A'));
  base.position.y = -0.6; base.receiveShadow = true; scene.add(base);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(size + 1.4, 0.3, size + 1.4), flatMaterial('#F2D9A6'));
  rim.position.y = -0.14; rim.receiveShadow = true; scene.add(rim);
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTexture() });
  const purple = flatMaterial('#9F86E8');
  const top = new THREE.Mesh(new THREE.BoxGeometry(size, 0.05, size), [purple, purple, floorMat, purple, purple, purple]);
  top.receiveShadow = true; scene.add(top);

  const parts = {} as Record<Zone, PlatformParts>;
  const doorGeo = new THREE.BoxGeometry(2, 0.12, 4);
  const pitMat = new THREE.MeshBasicMaterial({ color: '#120F1C' });
  const sideMat = flatMaterial(INK);

  for (const zone of ZONES) {
    const { x, z } = PLATFORM_CENTERS[zone];
    const normal = new THREE.MeshLambertMaterial({ map: platformTexture(zone, false) });
    const highlight = new THREE.MeshLambertMaterial({ map: platformTexture(zone, true), emissive: '#FFFFFF', emissiveIntensity: 0.18 });
    const tile = new THREE.Mesh(new THREE.BoxGeometry(4, 0.16, 4), [sideMat, sideMat, normal, sideMat, sideMat, sideMat]);
    tile.position.set(x, 0.08, z); tile.receiveShadow = true; scene.add(tile);

    const pit = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 4), pitMat);
    pit.position.set(x, 0.03, z); pit.visible = false; scene.add(pit);

    const doorMat = flatMaterial(ZONE_STYLE[zone].color);
    const hinges = [-1, 1].map(side => {
      const door = new THREE.Mesh(doorGeo, doorMat);
      door.position.x = -side; door.castShadow = true;
      const pivot = new THREE.Group();
      pivot.position.set(x + 2 * side, 0.08, z); pivot.visible = false;
      pivot.add(door); scene.add(pivot);
      return { pivot, side };
    });
    parts[zone] = { tile, topMaterials: { normal, highlight }, pit, hinges };
  }

  let openProgress = 0; // 0..1, só importa para as zonas em `opening`
  let opening: Zone[] = [];

  function applyDoors(): void {
    const angle = DOOR_OPEN_ANGLE * openProgress;
    for (const zone of opening) for (const h of parts[zone].hinges) h.pivot.rotation.z = h.side * angle;
  }

  function reset(): void {
    opening = []; openProgress = 0;
    for (const zone of ZONES) {
      const p = parts[zone];
      p.tile.visible = true;
      (p.tile.material as THREE.Material[])[2] = p.topMaterials.normal;
      p.pit.visible = false;
      for (const h of p.hinges) { h.pivot.visible = false; h.pivot.rotation.z = 0; }
    }
  }

  function setRevealed(correct: Zone | null, holes: Zone[]): void {
    reset();
    if (correct) (parts[correct].tile.material as THREE.Material[])[2] = parts[correct].topMaterials.highlight;
    for (const zone of holes) {
      const p = parts[zone];
      p.tile.visible = false; p.pit.visible = true;
      for (const h of p.hinges) h.pivot.visible = true;
    }
    opening = [...holes];
  }

  function update(dt: number): void {
    if (opening.length === 0 || openProgress >= 1) return;
    openProgress = Math.min(1, openProgress + dt / DOOR_OPEN_TIME);
    applyDoors();
  }

  return { setRevealed, reset, update };
}
