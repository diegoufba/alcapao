import { createGame, type GameConfig } from '../core/game';
import type { GameEvent, GameState, PlayerId, PlayerInput, Question, Vec2 } from '../core/types';
import { createStepper } from '../loop';
import type { SimFrame, SimSource } from './source';

export interface LocalHooks {
  /** Chamado uma vez por passo; cada chamada consome no máximo um empurrão pendente por jogador. */
  remoteInputs?(): ReadonlyMap<PlayerId, PlayerInput>;
  /** Depois de cada quadro que avançou ao menos um passo. `tick` = passos desde o início. */
  afterFrame?(tick: number, state: GameState, events: GameEvent[], themes: string[]): void;
}

const STEP = 1 / 60;

/** Fonte que simula a partida aqui mesmo (offline, ou host no online quando há `hooks`). */
export function createLocalSource(config: GameConfig, bank: Question[], hooks?: LocalHooks): SimSource {
  const game = createGame(config, bank);
  const stepper = createStepper();
  const held = new Map<PlayerId, PlayerInput>(); // o empurrão fica pendente até algum passo consumir
  const prev = new Map<PlayerId, Vec2>();
  let tick = 0;

  return {
    pausable: !hooks,
    skipPhase() { game.debugSkipPhase(); },

    advance(realDt, local) {
      const state = game.state;
      for (const [id, r] of local) {
        held.set(id, { move: r.move, push: r.push || (held.get(id)?.push ?? false) });
      }

      const { steps, alpha } = stepper.advance(realDt);
      const events: GameEvent[] = [];
      for (let i = 0; i < steps; i++) {
        for (const p of state.players) prev.set(p.id, { ...p.pos });
        const inputs: Partial<Record<PlayerId, PlayerInput>> = Object.fromEntries(held);
        if (hooks?.remoteInputs) for (const [id, r] of hooks.remoteInputs()) inputs[id] = r;
        events.push(...game.step(STEP, inputs));
        for (const h of held.values()) h.push = false;
        tick++;
      }
      if (steps === 0) for (const p of state.players) if (!prev.has(p.id)) prev.set(p.id, { ...p.pos });

      // fim do RESET (todos voltam ao slot) e respawn: a posição saltou, sem interpolar
      for (const e of events) {
        if (e.type === 'phaseChanged' && e.phase === 'spin') prev.clear();
        else if (e.type === 'respawned') for (const id of e.players) prev.delete(id);
      }

      const positions = new Map<PlayerId, Vec2>();
      for (const p of state.players) {
        const a = prev.get(p.id) ?? p.pos;
        positions.set(p.id, { x: a.x + (p.pos.x - a.x) * alpha, z: a.z + (p.pos.z - a.z) * alpha });
      }
      const themes = game.availableThemes();
      if (steps > 0) hooks?.afterFrame?.(tick, state, events, themes);
      const frame: SimFrame = { state, events, positions, themes };
      return frame;
    },
  };
}
