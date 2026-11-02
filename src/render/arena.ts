import * as THREE from 'three';
import type { Zone } from '../core/types';
import { ARENA_HALF, PLATFORM_CENTERS } from '../core/arena';
import { INK, ZONE_STYLE, drawZoneShape, flatMaterial } from './scene';

const ZONES: Zone[] = ['A', 'B', 'C', 'D'];
const DOOR_OPEN_ANGLE = 1.25;
const DOOR_OPEN_TIME = 0.4;

const PIT_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PIT_FRAGMENT = `
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float edge = max(abs(p.x), abs(p.y));
  float a = atan(p.y, p.x);

  // Espiral hipnótica no centro do poço
  float spiral = sin(a * 4.0 + r * 12.0 - uTime * 4.5);
  float rings  = sin(r * 18.0 - uTime * 6.0);
  float glow   = smoothstep(0.95, 0.15, r) * (0.5 + 0.5 * spiral) * 0.65
               + smoothstep(0.85, 0.0, r) * (0.5 + 0.5 * rings) * 0.35;

  vec3 deepColor = vec3(0.04, 0.02, 0.08);
  vec3 vortexCol = vec3(0.38, 0.16, 0.68);
  vec3 col = mix(deepColor, vortexCol, glow * smoothstep(0.05, 0.6, r));

  // Faixa de alerta nas bordas internas do alçapão
  float rimBand = smoothstep(0.82, 0.90, edge) * smoothstep(0.98, 0.92, edge);
  float stripes = step(0.0, sin((p.x + p.y) * 18.0 + uTime * 4.0));
  col = mix(col, mix(vec3(1.0, 0.42, 0.29), vec3(0.12, 0.10, 0.18), stripes), rimBand * 0.85);

  // Escurece o miolo para dar sensação de fundo infinito
  col *= smoothstep(0.0, 0.28, r);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

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
  const uTime = { value: 0 };
  const pitMat = new THREE.ShaderMaterial({
    vertexShader: PIT_VERTEX,
    fragmentShader: PIT_FRAGMENT,
    uniforms: { uTime },
  });
  const sideMat = flatMaterial(INK);

  for (const zone of ZONES) {
    const { x, z } = PLATFORM_CENTERS[zone];
    const normal = new THREE.MeshLambertMaterial({ map: platformTexture(zone, false) });
    const highlight = new THREE.MeshLambertMaterial({ map: platformTexture(zone, true), emissive: '#FFFFFF', emissiveIntensity: 0.18 });
    highlight.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.vertexShader = `varying vec2 vPulseUv;\n${shader.vertexShader}`.replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\nvPulseUv = uv;',
      );
      shader.fragmentShader = `uniform float uTime;\nvarying vec2 vPulseUv;\n${shader.fragmentShader}`.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec2 pUv = abs(vPulseUv * 2.0 - 1.0);
        float boxDist = max(pUv.x, pUv.y);
        float wave = fract(boxDist * 1.6 - uTime * 1.8);
        float ring = smoothstep(0.0, 0.2, wave) * smoothstep(0.55, 0.2, wave);
        float borderGlow = smoothstep(0.72, 0.92, boxDist) * (0.55 + 0.45 * sin(uTime * 8.0));
        totalEmissiveRadiance += vec3(1.0, 0.96, 0.78) * (ring * 0.45 + borderGlow * 0.55);`,
      );
    };
    const tile = new THREE.Mesh(new THREE.BoxGeometry(4, 0.16, 4), [sideMat, sideMat, normal, sideMat, sideMat, sideMat]);
    tile.position.set(x, 0.08, z); tile.receiveShadow = true; scene.add(tile);

    const pit = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 4), [sideMat, sideMat, pitMat, sideMat, sideMat, sideMat]);
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
    uTime.value += Math.min(dt, 0.1);
    if (opening.length === 0 || openProgress >= 1) return;
    openProgress = Math.min(1, openProgress + dt / DOOR_OPEN_TIME);
    applyDoors();
  }

  return { setRevealed, reset, update };
}
