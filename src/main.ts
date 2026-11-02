import '@fontsource/bungee/400.css';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/600.css';
import { createScene } from './render/scene';
import { createArena } from './render/arena';
import { createScreen } from './render/screen';
import { createDebug } from './render/debug';
import type { GameState, ShownQuestion } from './core/types';

const params = new URLSearchParams(location.search);
const showcase = params.get('showcase');

const EXAMPLE: ShownQuestion = {
  id: 'showcase', theme: 'Geografia', difficulty: 2, value: 200,
  text: 'Qual é o maior estado do Brasil em área?',
  options: ['Pará', 'Amazonas', 'Mato Grosso', 'Bahia'], correct: 'B',
};

// Vitrine visual (sem jogo): desenha um estado fixo da cena.
async function runShowcase(kind: string): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) return;
  document.body.style.margin = '0';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100vw;height:100vh';
  app.replaceChildren(canvas);

  await Promise.all([document.fonts.load('40px Bungee'), document.fonts.load('600 40px Rubik'), document.fonts.load('500 40px Rubik')]);
  const { renderer, scene, camera, resize } = createScene(canvas);
  const arena = createArena(scene);
  const screen = createScreen(scene);
  const debug = createDebug(scene);
  const mode = params.get('mode') === 'points' ? 'points' : 'survival';
  const totalRounds = mode === 'points' ? 12 : null;
  const round = mode === 'points' ? 6 : 4;

  if (kind === 'reveal') {
    screen.draw({ kind: 'reveal', q: EXAMPLE, round, totalRounds, mode });
    arena.setRevealed('B', ['A']);
  } else if (kind === 'spin') {
    screen.draw({ kind: 'spin', themes: ['Geografia', 'História', 'Ciência', 'Esportes', 'Cinema', 'Música'], highlighted: 'Ciência', round, totalRounds });
  } else if (kind === 'suddenDeath') {
    screen.draw({ kind: 'suddenDeath', players: ['P1', 'P3'] });
  } else {
    screen.draw({ kind: 'question', q: EXAMPLE, timeLeft: 5.2, round, totalRounds, mode });
  }

  if (params.has('debug')) {
    const player = (id: 'P1' | 'P2' | 'P3' | 'P4', x: number, z: number, inPlay = true): GameState['players'][number] => ({
      id, pos: { x, z }, vel: { x: 0, z: 0 }, facing: 0, inPlay, fallen: false,
      score: 0, pushCooldown: 0, frozen: 0, knockTime: 0, knockVel: { x: 0, z: 0 },
    });
    debug.update({
      mode, phase: 'question', phaseTime: 0, round, totalRounds, theme: EXAMPLE.theme, question: EXAMPLE, suddenDeath: null,
      players: [player('P1', 1.25, -1.9), player('P2', -0.55, -2), player('P3', 3.3, -2.4), player('P4', 0, 0, false)],
    });
    debug.setVisible(true);
  }

  window.addEventListener('resize', resize);
  let prev = performance.now();
  renderer.setAnimationLoop((now: number) => {
    arena.update(Math.min((now - prev) / 1000, 0.1)); prev = now;
    renderer.render(scene, camera);
    (window as unknown as { showcaseReady?: boolean }).showcaseReady = true;
  });
}

if (showcase) {
  void runShowcase(showcase);
} else {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (app) app.textContent = 'Alçapão';
}
