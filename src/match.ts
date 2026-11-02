import type * as THREE from 'three';
import { createArena } from './render/arena';
import { createScreen } from './render/screen';
import { screenViewFor } from './render/screen-view';
import { createDebug } from './render/debug';
import { createCharacter } from './render/character';
import { createEffects } from './render/effects';
import { createGame, type Game, type GameConfig } from './core/game';
import { createStepper } from './loop';
import { createHud } from './ui/hud';
import type { DeviceSlots } from './input/devices';
import type { GamepadInput } from './input/gamepad';
import type { KeyboardInput } from './input/keyboard';
import type { GameEvent, GameState, Mode, PlayerId, PlayerInput, Question, RankEntry, Zone } from './core/types';

const PLAYER_IDS: PlayerId[] = ['P1', 'P2', 'P3', 'P4'];
const PUSH_POSE_TIME = 0.3;

export interface MatchResult {
  mode: Mode;
  rounds?: number;
  players: number;
  ranking: RankEntry[];
  roundsSurvived?: number;
  scores?: Partial<Record<PlayerId, number>>;
}

export interface MatchDeps {
  scene: THREE.Scene;
  hudRoot: HTMLElement;
  bank: Question[];
  keyboard: KeyboardInput;
  gamepad: GamepadInput;
}

export interface MatchController {
  /** Começa uma partida nova (zera teclado/gamepad, R10). */
  start(config: GameConfig, devices: DeviceSlots): void;
  /** Um quadro: lê entradas, avança passos fixos e sincroniza a cena. Não faz nada pausado. */
  update(realDt: number): void;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  isOver(): boolean;
  /** Esconde personagens e HUD e descarta a partida. */
  stop(): void;
  /** Só existe depois de `isOver()`. */
  result(): MatchResult | null;
  setDebug(on: boolean): void;
  skipPhase(): void;
  /** Estado da partida em andamento (null fora de uma partida). */
  state(): GameState | null;
  /** Eventos gerados desde a última chamada (o áudio os consome a cada quadro). */
  drainEvents(): GameEvent[];
}

export function createMatchController({ scene, hudRoot, bank, keyboard, gamepad }: MatchDeps): MatchController {
  const pending: GameEvent[] = [];
  const arena = createArena(scene);
  const screen = createScreen(scene);
  const debug = createDebug(scene);
  const effects = createEffects(scene);
  const chars = Object.fromEntries(PLAYER_IDS.map((id) => {
    const c = createCharacter(id);
    scene.add(c.root);
    return [id, c];
  })) as Record<PlayerId, ReturnType<typeof createCharacter>>;

  let hud = createHud(hudRoot);
  let devices: DeviceSlots | null = null;
  let game: Game | null = null;
  let result: MatchResult | null = null;
  let paused = false;
  let clock = 0;
  let stepper = createStepper();
  const held = new Map<PlayerId, PlayerInput>();
  const prev = new Map<PlayerId, { x: number; z: number }>();
  const pushUntil = new Map<PlayerId, number>();
  const cheering = new Set<PlayerId>();
  const respawning = new Set<PlayerId>(); // core mantém fallen até o fim do RESET (R12)
  let lastZones: Partial<Record<PlayerId, Zone | null>> = {};

  function hideCharacters(): void {
    for (const id of PLAYER_IDS) chars[id].update(0, { pos: { x: 0, z: 0 }, facing: 0, speed: 0, pose: 'idle', visible: false });
  }

  function handleEvents(state: GameState, events: GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'phaseChanged' && e.phase === 'spin') { arena.reset(); respawning.clear(); prev.clear(); } // fim do RESET: todos voltam ao slot
      else if (e.type === 'locked') lastZones = e.zones;
      else if (e.type === 'pushed') {
        pushUntil.set(e.by, clock + PUSH_POSE_TIME);
        const p = state.players.find((q) => q.id === e.by);
        if (p && e.targets.length > 0) {
          const dir = { x: Math.sin(p.facing), z: Math.cos(p.facing) };
          effects.pushPuff({ x: p.pos.x + dir.x * 0.8, z: p.pos.z + dir.z * 0.8 }, dir);
        }
      } else if (e.type === 'revealed') {
        const holes = e.fallen.map((id) => lastZones[id]).filter((z): z is Zone => !!z);
        arena.setRevealed(e.correct, holes);
        for (const id of e.fallen) chars[id].playFall();
        cheering.clear();
        if (!e.voided) {
          for (const p of state.players) {
            const ok = state.mode === 'points' && !state.suddenDeath ? (e.scored[p.id] ?? 0) > 0 : p.inPlay && !e.fallen.includes(p.id);
            if (ok) cheering.add(p.id);
          }
        }
      } else if (e.type === 'respawned') {
        for (const id of e.players) { respawning.add(id); chars[id].playRespawnDrop(); prev.delete(id); } // posição saltou: sem interpolar
      } else if (e.type === 'gameOver') {
        const rounds = state.totalRounds ?? undefined;
        result = { mode: state.mode, rounds, players: state.players.length, ranking: e.ranking, roundsSurvived: e.roundsSurvived, scores: e.scores };
      }
    }
    if (state.phase !== 'reveal') cheering.clear();
  }

  function syncCharacters(state: GameState, alpha: number, dt: number): void {
    for (const id of PLAYER_IDS) {
      const p = state.players.find((q) => q.id === id);
      if (!p) { chars[id].update(dt, { pos: { x: 0, z: 0 }, facing: 0, speed: 0, pose: 'idle', visible: false }); continue; }
      const a = prev.get(id) ?? p.pos;
      const pos = { x: a.x + (p.pos.x - a.x) * alpha, z: a.z + (p.pos.z - a.z) * alpha };
      const speed = Math.hypot(p.vel.x, p.vel.z);
      const pose = p.fallen && !respawning.has(id) ? 'fall'
        : (pushUntil.get(id) ?? 0) > clock ? 'push'
          : cheering.has(id) ? 'cheer'
            : speed > 0.2 ? 'walk' : 'idle';
      chars[id].update(dt, { pos, facing: p.facing, speed, pose, visible: p.inPlay });
    }
  }

  let debugOn = false;

  return {
    start(config, slots) {
      pending.length = 0;
      devices = slots;
      game = createGame(config, bank);
      result = null;
      paused = false;
      stepper = createStepper();
      keyboard.reset();
      gamepad.reset();
      hud = createHud(hudRoot);
      arena.reset();
      for (const c of Object.values(chars)) c.reset();
      effects.clear();
      respawning.clear(); held.clear(); prev.clear(); pushUntil.clear(); cheering.clear();
      lastZones = {};
    },

    update(realDt) {
      if (paused) return;
      const dt = Math.min(realDt, 0.1);
      clock += dt;
      arena.update(dt);
      effects.update(dt);
      if (!game || !devices) return;
      const state = game.state;
      if (import.meta.env.DEV) (window as unknown as { matchState?: GameState }).matchState = state; // gancho para a verificação automatizada

      // entrada: o push fica pendente até algum passo consumir
      for (const id of devices.players()) {
        const d = devices.deviceOf(id);
        if (!d) continue;
        const r = d.startsWith('gp-') ? gamepad.read(d) : keyboard.read(d);
        const h = held.get(id);
        held.set(id, { move: r.move, push: r.push || (h?.push ?? false) });
      }

      const { steps, alpha } = stepper.advance(realDt);
      const events: GameEvent[] = [];
      for (let i = 0; i < steps; i++) {
        for (const p of state.players) prev.set(p.id, { ...p.pos });
        const inputs: Partial<Record<PlayerId, PlayerInput>> = Object.fromEntries(held);
        events.push(...game.step(1 / 60, inputs));
        for (const h of held.values()) h.push = false;
      }
      if (steps === 0) for (const p of state.players) if (!prev.has(p.id)) prev.set(p.id, { ...p.pos });

      handleEvents(state, events);
      pending.push(...events);
      syncCharacters(state, alpha, dt);
      const view = screenViewFor(state, clock, game.availableThemes());
      if (view) screen.draw(view);
      hud.update(state, devices, events);
      if (debugOn) debug.update(state);
      if (import.meta.env.DEV) (window as unknown as { matchReady?: boolean }).matchReady = true;
    },

    pause() { if (game) paused = true; },
    resume() { paused = false; },
    isPaused: () => paused,
    isOver: () => game?.state.phase === 'over',
    state: () => game?.state ?? null,
    drainEvents() { return pending.splice(0); },
    result: () => result,

    stop() {
      game = null; devices = null; result = null; paused = false; pending.length = 0;
      hud = createHud(hudRoot);
      hideCharacters();
      effects.clear();
      arena.reset();
    },

    setDebug(on) { debugOn = on; debug.setVisible(on); },
    skipPhase() { game?.debugSkipPhase(); },
  };
}
