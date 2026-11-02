import '@fontsource/bungee/400.css';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/600.css';
import { createScene } from './render/scene';
import { createArena } from './render/arena';
import { createScreen } from './render/screen';
import { createDebug } from './render/debug';
import { createCharacter, type Pose } from './render/character';
import { createEffects } from './render/effects';
import './ui/styles.css';
import { createGame, type Game, type GameConfig } from './core/game';
import { validateBank } from './core/questions';
import questionsJson from './data/questions.json';
import { KeyboardInput, type DeviceId } from './input/keyboard';
import { GamepadInput, type PadLike } from './input/gamepad';
import { DeviceSlots } from './input/devices';
import { createStepper } from './loop';
import { createHud } from './ui/hud';
import type { GameEvent, GameState, PlayerId, PlayerInput, RankEntry, ShownQuestion, Zone } from './core/types';
import type { ScreenView } from './render/screen';

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
  const effects = createEffects(scene);
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
    arena.update(dt);
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
        ch.c.update(dt, { pos: { x: ch.x, z: 1 }, facing: 0, speed: pose === 'walk' ? 4 : 0, pose, visible: true });
      }
      effects.update(dt);
    }
    renderer.render(scene, camera);
    (window as unknown as { showcaseReady?: boolean }).showcaseReady = true;
  });
}


// ---------------------------------------------------------------------------
// Partida jogável
// ---------------------------------------------------------------------------

const THEMES = ['Geografia', 'História', 'Ciências', 'Esportes', 'Entretenimento', 'Tecnologia'];
const QUICK_DEVICES: DeviceId[] = ['kb-wasd', 'kb-arrows', 'kb-ijkl', 'gp-0'];
const PLAYER_IDS: PlayerId[] = ['P1', 'P2', 'P3', 'P4'];
const PUSH_POSE_TIME = 0.3;
const SPIN_SETTLE = 0.6;
const SPIN_TICK = 12; // trocas de tema por segundo durante a roleta

function ordinal(n: number): string { return `${n}º`; }

function rankingText(r: RankEntry): string {
  const extra = r.score !== undefined ? ` — ${r.score.toLocaleString('pt-BR')} pts` : r.eliminatedRound !== undefined ? ` — caiu na rodada ${r.eliminatedRound}` : '';
  return `${ordinal(r.pos)} ${r.id}${extra}`;
}

function screenView(state: GameState, clock: number): ScreenView | null {
  const { phase } = state;
  if (phase === 'spin') {
    if (state.suddenDeath) return { kind: 'suddenDeath', players: state.suddenDeath };
    const settled = state.theme !== null && state.phaseTime <= SPIN_SETTLE;
    const highlighted = settled ? (state.theme as string) : THEMES[Math.floor(clock * SPIN_TICK) % THEMES.length];
    return { kind: 'spin', themes: THEMES, highlighted, round: state.round, totalRounds: state.totalRounds };
  }
  const q = state.question;
  if (!q) return null;
  if (phase === 'question') return { kind: 'question', q, timeLeft: state.phaseTime, round: state.round, totalRounds: state.totalRounds, mode: state.mode };
  if (phase === 'lock') return { kind: 'question', q, timeLeft: 0, round: state.round, totalRounds: state.totalRounds, mode: state.mode };
  if (phase === 'reveal' || phase === 'reset') return { kind: 'reveal', q, round: state.round, totalRounds: state.totalRounds, mode: state.mode };
  return null;
}

async function runMatch(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) return;
  const quick = params.get('quick');
  const canvas = document.createElement('canvas');
  const hudRoot = document.createElement('div');
  const fpsEl = document.createElement('div');
  fpsEl.className = 'fps';
  const overEl = document.createElement('div');
  overEl.className = 'over';
  app.replaceChildren(canvas, hudRoot, fpsEl, overEl);

  await Promise.all([document.fonts.load('40px Bungee'), document.fonts.load('600 40px Rubik'), document.fonts.load('500 40px Rubik')]);
  const { renderer, scene, camera, resize } = createScene(canvas);
  const arena = createArena(scene);
  const screen = createScreen(scene);
  const debug = createDebug(scene);
  const effects = createEffects(scene);
  const chars = Object.fromEntries(PLAYER_IDS.map((id) => {
    const c = createCharacter(id);
    scene.add(c.root);
    return [id, c];
  })) as Record<PlayerId, ReturnType<typeof createCharacter>>;
  const bank = validateBank(questionsJson).questions;

  const keyboard = new KeyboardInput();
  const gamepad = new GamepadInput();
  let devices = new DeviceSlots();
  let config: GameConfig | null = null;
  let game: Game | null = null;
  let hud = createHud(hudRoot);

  const n = Math.min(Math.max(Number(params.get('players')) || 2, 1), 4);
  const startMatch = (): void => {
    const players = PLAYER_IDS.slice(0, n);
    devices = new DeviceSlots();
    QUICK_DEVICES.slice(0, n).forEach((d) => devices.join(d));
    const seed = Date.now();
    const rounds = Number(params.get('rounds'));
    config = quick === 'points'
      ? { mode: 'points', rounds: rounds === 12 || rounds === 16 ? rounds : 8, players, seed }
      : { mode: 'survival', players, seed };
    game = createGame(config, bank);
    keyboard.reset();
    gamepad.reset();
    hud = createHud(hudRoot);
    arena.reset();
    overEl.classList.remove('is-on');
    overEl.replaceChildren();
    held.clear(); prev.clear(); pushUntil.clear(); cheering.clear(); holes = [];
    lastZones = {};
  };

  const held = new Map<PlayerId, PlayerInput>();
  const prev = new Map<PlayerId, { x: number; z: number }>();
  const pushUntil = new Map<PlayerId, number>();
  const cheering = new Set<PlayerId>();
  let holes: Zone[] = [];
  let lastZones: Partial<Record<PlayerId, Zone | null>> = {};
  let clock = 0;
  const frames: number[] = [];

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F1') { e.preventDefault(); const on = !fpsEl.classList.contains('is-on'); fpsEl.classList.toggle('is-on', on); debug.setVisible(on); return; }
    if (e.code === 'KeyN' && fpsEl.classList.contains('is-on')) { game?.debugSkipPhase(); return; }
    if (e.code === 'KeyR' && game?.state.phase === 'over') { startMatch(); return; }
    if (keyboard.keyDown(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keyboard.keyUp(e.code));
  window.addEventListener('blur', () => keyboard.reset());
  window.addEventListener('resize', resize);

  function handleEvents(state: GameState, events: GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'phaseChanged' && e.phase === 'spin') { arena.reset(); holes = []; }
      else if (e.type === 'locked') lastZones = e.zones;
      else if (e.type === 'pushed') {
        pushUntil.set(e.by, clock + PUSH_POSE_TIME);
        const p = state.players.find((q) => q.id === e.by);
        if (p && e.targets.length > 0) {
          const dir = { x: Math.sin(p.facing), z: Math.cos(p.facing) };
          effects.pushPuff({ x: p.pos.x + dir.x * 0.8, z: p.pos.z + dir.z * 0.8 }, dir);
        }
      } else if (e.type === 'revealed') {
        holes = e.fallen.map((id) => lastZones[id]).filter((z): z is Zone => !!z);
        arena.setRevealed(e.correct, holes);
        for (const id of e.fallen) chars[id].playFall();
        cheering.clear();
        if (!e.voided) {
          for (const p of state.players) {
            const ok = state.mode === 'points' ? (e.scored[p.id] ?? 0) > 0 : p.inPlay && !e.fallen.includes(p.id);
            if (ok) cheering.add(p.id);
          }
        }
      } else if (e.type === 'respawned') {
        for (const id of e.players) chars[id].playRespawnDrop();
      } else if (e.type === 'gameOver') {
        const rows = e.ranking.map((r) => { const d = document.createElement('div'); d.className = 'rank'; d.textContent = rankingText(r); return d; });
        const h = document.createElement('h1'); h.textContent = 'Fim de jogo';
        const hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = 'R para reiniciar';
        overEl.replaceChildren(h, ...rows, hint);
        overEl.classList.add('is-on');
      }
    }
    if (state.phase !== 'reveal') cheering.clear();
  }

  function render(state: GameState, alpha: number, dt: number): void {
    for (const id of PLAYER_IDS) {
      const p = state.players.find((q) => q.id === id);
      if (!p) { chars[id].update(dt, { pos: { x: 0, z: 0 }, facing: 0, speed: 0, pose: 'idle', visible: false }); continue; }
      const a = prev.get(id) ?? p.pos;
      const pos = { x: a.x + (p.pos.x - a.x) * alpha, z: a.z + (p.pos.z - a.z) * alpha };
      const speed = Math.hypot(p.vel.x, p.vel.z);
      const pose = p.fallen ? 'fall'
        : (pushUntil.get(id) ?? 0) > clock ? 'push'
          : cheering.has(id) ? 'cheer'
            : speed > 0.2 ? 'walk' : 'idle';
      chars[id].update(dt, { pos, facing: p.facing, speed, pose, visible: p.inPlay });
    }
  }

  startMatch();
  const stepper = createStepper();
  let last = performance.now();
  renderer.setAnimationLoop((now: number) => {
    const real = (now - last) / 1000; last = now;
    const dt = Math.min(real, 0.1);
    clock += dt;
    frames.push(now);
    while (frames.length > 1 && now - frames[0] > 1000) frames.shift();

    if (!game) return;
    const state = game.state;
    if (import.meta.env.DEV) (window as unknown as { matchState?: GameState }).matchState = state; // gancho para a verificação automatizada

    // entrada: teclado e gamepads (o push fica pendente até algum passo consumir)
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) as (PadLike | null)[] : [];
    const poll = gamepad.poll(pads);
    for (const d of poll.disconnected) devices.setConnected(d, false);
    for (const d of poll.reconnected) devices.setConnected(d, true);
    for (const id of devices.players()) {
      const d = devices.deviceOf(id);
      if (!d) continue;
      const r = d.startsWith('gp-') ? gamepad.read(d) : keyboard.read(d);
      const h = held.get(id);
      held.set(id, { move: r.move, push: r.push || (h?.push ?? false) });
    }

    const { steps, alpha } = stepper.advance(real);
    const events: GameEvent[] = [];
    for (let i = 0; i < steps; i++) {
      for (const p of state.players) prev.set(p.id, { ...p.pos });
      const inputs: Partial<Record<PlayerId, PlayerInput>> = Object.fromEntries(held);
      events.push(...game.step(1 / 60, inputs));
      for (const h of held.values()) h.push = false;
    }
    if (steps === 0) for (const p of state.players) if (!prev.has(p.id)) prev.set(p.id, { ...p.pos });

    handleEvents(state, events);
    render(state, alpha, dt);
    arena.update(dt);
    effects.update(dt);
    const view = screenView(state, clock);
    if (view) screen.draw(view);
    hud.update(state, devices, events);
    if (fpsEl.classList.contains('is-on')) {
      debug.update(state);
      fpsEl.textContent = `${frames.length} FPS`;
    }
    renderer.render(scene, camera);
    (window as unknown as { matchReady?: boolean }).matchReady = true;
  });
}

if (showcase) {
  void runShowcase(showcase);
} else if (params.has('quick')) {
  void runMatch();
} else {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (app) app.textContent = 'Alçapão';
}
