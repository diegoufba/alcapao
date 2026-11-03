import type { PlayerId, PlayerInput, Vec2 } from '../core/types';
import { PROTOCOL_VERSION } from './protocol';
import type { LobbyInfo } from './protocol';

/** Máximo de empurrões pendentes por jogador remoto: spam ou salto do contador não geram rajada. */
const MAX_PENDING_PUSHES = 2;
/** Passos (1/60 s) sem input depois dos quais o host trata o jogador como parado (0,5 s). */
const MAX_IDLE_STEPS = 30;
const MAX_PLAYERS = 4;
const PLAYER_IDS: readonly PlayerId[] = ['P1', 'P2', 'P3', 'P4'];

/** Garante um vetor finito e de comprimento no máximo 1. Não finito vira parado. */
export function sanitizeMove(v: Vec2): Vec2 {
  if (!Number.isFinite(v.x) || !Number.isFinite(v.z)) return { x: 0, z: 0 };
  const len = Math.hypot(v.x, v.z);
  if (len <= 1) return { x: v.x, z: v.z };
  return { x: v.x / len, z: v.z / len };
}

interface RemoteState {
  move: Vec2;
  lastCount: number;
  pending: number;
  idle: number;
}

/** Inputs dos clientes remotos, lidos pelo host a cada passo da simulação. */
export class RemoteInputs {
  private readonly players = new Map<PlayerId, RemoteState>();

  set(id: PlayerId, move: Vec2, pushCount: number): void {
    const state = this.players.get(id) ?? { move: { x: 0, z: 0 }, lastCount: 0, pending: 0, idle: 0 };
    state.idle = 0;
    state.move = sanitizeMove(move);
    if (Number.isInteger(pushCount) && pushCount >= 0) {
      const novos = Math.max(0, pushCount - state.lastCount);
      state.pending = Math.min(MAX_PENDING_PUSHES, state.pending + novos);
      state.lastCount = Math.max(state.lastCount, pushCount);
    }
    this.players.set(id, state);
  }

  /** Um passo: devolve o input de cada jogador remoto e consome ≤ 1 empurrão pendente de cada. */
  next(): Map<PlayerId, PlayerInput> {
    const out = new Map<PlayerId, PlayerInput>();
    for (const [id, state] of this.players) {
      const push = state.pending > 0;
      if (push) state.pending--;
      state.idle++;
      const move = state.idle > MAX_IDLE_STEPS ? { x: 0, z: 0 } : state.move;
      out.set(id, { move, push });
    }
    return out;
  }

  /** Começo de partida: zera empurrões pendentes e move de todos, mas guarda a contagem (vale a conexão inteira). */
  resetPending(): void {
    for (const state of this.players.values()) {
      state.pending = 0;
      state.move = { x: 0, z: 0 };
    }
  }

  /** O jogador some do mapa (fica parado) e a contagem dele recomeça do zero. */
  drop(id: PlayerId): void {
    this.players.delete(id);
  }
}

export type Admission = { ok: true; id: PlayerId } | { ok: false; reason: 'full' | 'started' | 'version' };

/** Decide a entrada de um cliente na sala, nesta ordem: versão, partida iniciada, lotação, menor id livre. */
export function admit(lobby: LobbyInfo, hello: { protocol: number; build: string }, expectedBuild: string): Admission {
  if (hello.protocol !== PROTOCOL_VERSION || hello.build !== expectedBuild) return { ok: false, reason: 'version' };
  if (lobby.started) return { ok: false, reason: 'started' };
  if (lobby.players.length >= MAX_PLAYERS) return { ok: false, reason: 'full' };
  const livre = PLAYER_IDS.find((id) => !lobby.players.includes(id));
  if (livre === undefined) return { ok: false, reason: 'full' };
  return { ok: true, id: livre };
}
