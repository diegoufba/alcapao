import type { GameEvent, GameState, PlayerId, PlayerInput, Vec2 } from '../core/types';

/** O que a cena precisa para desenhar um quadro. */
export interface SimFrame {
  state: GameState;
  events: GameEvent[];
  /** Posição de cada jogador, já interpolada para desenhar. */
  positions: ReadonlyMap<PlayerId, Vec2>;
  /** Temas que ainda têm perguntas (o telão mostra na roleta). */
  themes: string[];
}

/** De onde vem a partida: simulada aqui (local/host) ou recebida (cliente). */
export interface SimSource {
  /** `null` = ainda não há estado (cliente sem snapshot). */
  advance(realDt: number, local: ReadonlyMap<PlayerId, PlayerInput>): SimFrame | null;
  /** Só a partida local sem ganchos pode ser pausada. */
  readonly pausable: boolean;
  skipPhase(): void;
}
