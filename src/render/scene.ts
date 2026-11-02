import * as THREE from 'three';
import type { PlayerId } from '../core/types';

export const ACCENT = '#FFC83D';
export const BACKGROUND = '#0E1120';
export const PLAYER_COLORS: Record<PlayerId, string> = {
  P1: '#4C8DFF', P2: '#FF8A3D', P3: '#3DDC97', P4: '#E06CF5',
};

export function flatMaterial(color: string, params: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...params });
}

export function enableShadows(root: THREE.Object3D): void {
  root.traverse(o => {
    if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; }
  });
}

export function createScene(canvas: HTMLCanvasElement): {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; resize(): void;
} {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  scene.fog = new THREE.Fog(BACKGROUND, 26, 48);

  scene.add(new THREE.HemisphereLight('#B9C3FF', '#1A1E36', 1.1));
  const sun = new THREE.DirectionalLight('#FFF4E0', 2.4);
  sun.position.set(6, 16, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 50 });
  scene.add(sun);
  const screenGlow = new THREE.PointLight('#8FA8FF', 30, 22, 1.6);
  screenGlow.position.set(0, 5, -6);
  scene.add(screenGlow);

  const ground = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 40), flatMaterial('#151933'));
  ground.position.y = -1.6;
  ground.receiveShadow = true;
  scene.add(ground);

  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  camera.position.set(0, 10.5, 15.5);
  camera.lookAt(0, 2.6, -2.6);

  function resize(): void {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  return { renderer, scene, camera, resize };
}
