import { createScene } from './render/scene';
import { createArena } from './render/arena';
import { createScreen } from './render/screen';
import { createDebug } from './render/debug';
import { createCharacter, type Pose } from './render/character';
import { createEffects } from './render/effects';
import type { GameState, ShownQuestion } from './core/types';

const EXAMPLE: ShownQuestion = {
  id: 'showcase', theme: 'Geografia', difficulty: 2, value: 200,
  text: 'Qual é o maior estado do Brasil em área?',
  options: ['Pará', 'Amazonas', 'Mato Grosso', 'Bahia'], correct: 'B',
};

// Vitrine visual (sem jogo): desenha um estado fixo da cena.
export async function runShowcase(kind: string, params: URLSearchParams): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) return;
  document.body.style.margin = '0';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100vw;height:100vh';
  app.replaceChildren(canvas);

  await Promise.all([document.fonts.load('40px "Titan One"'), document.fonts.load('700 40px Nunito'), document.fonts.load('800 40px Nunito')]);
  const { renderer, scene, camera, resize, update: updateScene } = createScene(canvas);
  const arena = createArena(scene);
  const screen = createScreen(scene);
  const debug = createDebug(scene);
  const effects = createEffects(scene);
  const mode = params.get('mode') === 'points' ? 'points' : 'survival';
  const totalRounds = mode === 'points' ? 12 : null;
  const round = mode === 'points' ? 6 : 4;

  const sd = params.has('sd');
  if (kind === 'reveal') {
    screen.draw({ kind: 'reveal', q: EXAMPLE, round, totalRounds, mode, suddenDeath: sd });
    arena.setRevealed('B', ['A']);
  } else if (kind === 'spin') {
    screen.draw({ kind: 'spin', themes: ['Geografia', 'História', 'Ciência', 'Esportes', 'Cinema', 'Música'], highlighted: 'Ciência', round, totalRounds });
  } else if (kind === 'suddenDeath') {
    screen.draw({ kind: 'suddenDeath', players: ['P1', 'P3'] });
  } else {
    screen.draw({ kind: 'question', q: EXAMPLE, timeLeft: 5.2, round, totalRounds, mode, suddenDeath: sd });
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

  const cycle: Pose[] = ['idle', 'walk', 'push', 'cheer', 'fall'];
  const chars = (kind === 'characters' ? (['P1', 'P2', 'P3', 'P4'] as const) : []).map((id, i) => {
    const c = createCharacter(id);
    scene.add(c.root);
    return { c, x: -4.5 + i * 3, offset: i, lastStep: -1 };
  });

  window.addEventListener('resize', resize);
  let prev = performance.now();
  renderer.setAnimationLoop((now: number) => {
    const dt = Math.min((now - prev) / 1000, 0.1); prev = now;
    updateScene(dt, sd || kind === 'suddenDeath');
    arena.update(dt);
    screen.update(dt);
    if (kind === 'characters') {
      for (const ch of chars) {
        const step = Math.floor(now / 1000) + ch.offset;
        const pose = cycle[step % cycle.length];
        if (step !== ch.lastStep) {
          if (pose === 'fall') ch.c.playFall();
          else if (cycle[(step + cycle.length - 1) % cycle.length] === 'fall') ch.c.playRespawnDrop();
          if (pose === 'push') effects.pushPuff({ x: ch.x, z: 1.8 }, { x: 0, z: 1 });
          ch.lastStep = step;
        }
        ch.c.update(dt, { pos: { x: ch.x, z: 1 }, facing: 0, speed: pose === 'walk' ? 5 : 0, pose, visible: true });
      }
      effects.update(dt);
    }
    renderer.render(scene, camera);
    (window as unknown as { showcaseReady?: boolean }).showcaseReady = true;
  });
}
