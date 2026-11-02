import * as THREE from 'three';
import type { PlayerId, Zone } from '../core/types';

export const ACCENT = '#FF6B4A';
export const YELLOW = '#FFD23F';
export const INK = '#1E1A2E';
export const SKY = '#A8E4FF';
export const PLAYER_COLORS: Record<PlayerId, string> = {
  P1: '#4C8DFF', P2: '#FF8A3D', P3: '#3DDC97', P4: '#E06CF5',
};

/** Cor, forma e nome de cada plataforma: as mesmas do cartão da alternativa no telão. */
export const ZONE_STYLE: Record<Zone, { color: string; shape: 'triangle' | 'diamond' | 'circle' | 'square'; name: string }> = {
  A: { color: '#F0525E', shape: 'triangle', name: 'vermelho' },
  B: { color: '#3D7BEA', shape: 'diamond', name: 'azul' },
  C: { color: '#FFC93C', shape: 'circle', name: 'amarelo' },
  D: { color: '#2FB35A', shape: 'square', name: 'verde' },
};

/** Desenha a forma da zona centrada em (cx, cy), com `size` de lado, branca com contorno escuro. */
export function drawZoneShape(ctx: CanvasRenderingContext2D, zone: Zone, cx: number, cy: number, size: number, fill = '#FFFFFF'): void {
  const r = size / 2;
  ctx.beginPath();
  switch (ZONE_STYLE[zone].shape) {
    case 'triangle':
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 1.05, cy + r * 0.8); ctx.lineTo(cx - r * 1.05, cy + r * 0.8); ctx.closePath(); break;
    case 'diamond':
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); break;
    case 'circle':
      ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2); break;
    case 'square':
      ctx.rect(cx - r * 0.75, cy - r * 0.75, r * 1.5, r * 1.5); break;
  }
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.09); ctx.strokeStyle = INK; ctx.stroke();
}

export function flatMaterial(color: string, params: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...params });
}

export function enableShadows(root: THREE.Object3D): void {
  root.traverse(o => {
    if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; }
  });
}

/** Nuvem low-poly: algumas esferas achatadas lado a lado. */
function cloud(x: number, y: number, z: number, s: number): THREE.Group {
  const g = new THREE.Group();
  const mat = flatMaterial('#FFFFFF', { emissive: '#FFFFFF', emissiveIntensity: 0.35 });
  for (const [dx, dy, r] of [[-1.3, 0, 1], [0, 0.45, 1.35], [1.4, 0.05, 1.05], [0.6, -0.2, 0.9]] as const) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
    m.position.set(dx, dy, 0); m.scale.set(1, 0.75, 0.7); g.add(m);
  }
  g.position.set(x, y, z); g.scale.setScalar(s);
  return g;
}

const SKY_VERTEX = `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_FRAGMENT = `
uniform float uSuddenDeath;
varying vec3 vWorldPos;
void main() {
  float h = clamp((vWorldPos.y + 4.0) / 48.0, 0.0, 1.0);
  vec3 dayBottom = vec3(0.76, 0.93, 1.0);
  vec3 dayTop    = vec3(0.42, 0.76, 0.99);
  vec3 sdBottom  = vec3(1.0, 0.42, 0.28);
  vec3 sdMid     = vec3(0.62, 0.20, 0.48);
  vec3 sdTop     = vec3(0.18, 0.08, 0.28);

  vec3 day = mix(dayBottom, dayTop, smoothstep(0.0, 1.0, h));
  vec3 sd  = mix(sdBottom, sdMid, smoothstep(0.0, 0.45, h));
  sd       = mix(sd, sdTop, smoothstep(0.35, 1.0, h));

  vec3 col = mix(day, sd, uSuddenDeath);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/** Tufos de grama espalhados pelo campo, num único InstancedMesh com vertex shader de vento. */
function grass(scene: THREE.Scene, uTime: { value: number }): void {
  const geo = new THREE.ConeGeometry(0.12, 0.45, 4);
  const mat = flatMaterial('#5DB847');
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float tip = clamp((position.y + 0.225) / 0.45, 0.0, 1.0);
      vec4 instPos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float wave = sin(uTime * 2.8 + instPos.x * 0.45 + instPos.z * 0.35) * 0.11
                 + cos(uTime * 1.7 - instPos.z * 0.5) * 0.05;
      transformed.x += wave * tip * tip;
      transformed.z += wave * 0.5 * tip * tip;`
    );
  };
  const tufts = new THREE.InstancedMesh(geo, mat, 420);
  const m = new THREE.Matrix4();
  let n = 0, seed = 7;
  const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  while (n < tufts.count) {
    const x = (rnd() - 0.5) * 56, z = -20 + rnd() * 34;
    if (Math.abs(x) < 7.2 && z > -7.2 && z < 7.2) continue; // fora da arena
    m.makeTranslation(x, -0.88, z);
    tufts.setMatrixAt(n++, m);
  }
  scene.add(tufts);
}

export function createScene(canvas: HTMLCanvasElement): {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  resize(): void;
  update(dt: number, suddenDeath?: boolean): void;
} {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const fogColorDay = new THREE.Color(SKY);
  const fogColorSd = new THREE.Color('#D85A4A');
  const fog = new THREE.Fog(SKY, 34, 70);
  scene.background = new THREE.Color(SKY);
  scene.fog = fog;

  const uTime = { value: 0 };
  const uSuddenDeath = { value: 0 };

  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(110, 32, 20),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: { uSuddenDeath },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  scene.add(skyDome);

  const hemi = new THREE.HemisphereLight('#E6F6FF', '#6FA65A', 1.6);
  scene.add(hemi);
  const hemiSkyDay = new THREE.Color('#E6F6FF');
  const hemiSkySd = new THREE.Color('#FF9E80');
  const hemiGroundDay = new THREE.Color('#6FA65A');
  const hemiGroundSd = new THREE.Color('#4B2D54');

  const sun = new THREE.DirectionalLight('#FFF6E6', 2.2);
  sun.position.set(6, 16, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 50 });
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.BoxGeometry(160, 1, 120), flatMaterial('#7CC85A'));
  ground.position.y = -1.6;
  ground.receiveShadow = true;
  scene.add(ground);
  grass(scene, uTime);
  for (const [x, y, z, s] of [[-17, 13, -26, 1.6], [-8, 16.5, -30, 1.3], [12, 15, -28, 1.5], [21, 11.5, -24, 1.2], [-24, 9, -20, 1.1]] as const) {
    scene.add(cloud(x, y, z, s));
  }

  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 240);
  camera.position.set(0, 11.7, 18.2);
  camera.lookAt(0, 2.0, -2.6);

  function resize(): void {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  function update(dt: number, suddenDeath = false): void {
    const step = Math.min(dt, 0.1);
    uTime.value += step;
    const target = suddenDeath ? 1 : 0;
    uSuddenDeath.value += (target - uSuddenDeath.value) * (1 - Math.exp(-3 * step));
    fog.color.copy(fogColorDay).lerp(fogColorSd, uSuddenDeath.value);
    hemi.color.copy(hemiSkyDay).lerp(hemiSkySd, uSuddenDeath.value);
    hemi.groundColor.copy(hemiGroundDay).lerp(hemiGroundSd, uSuddenDeath.value);
  }

  return { renderer, scene, camera, resize, update };
}
