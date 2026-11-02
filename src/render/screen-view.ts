import type { GameState, Mode, PlayerId, ShownQuestion } from '../core/types';

export type ScreenView =
  | { kind: 'spin'; themes: string[]; highlighted: string; round: number; totalRounds: number | null }
  | { kind: 'question'; q: ShownQuestion; timeLeft: number; round: number; totalRounds: number | null; mode: Mode; suddenDeath: boolean }
  | { kind: 'reveal'; q: ShownQuestion; round: number; totalRounds: number | null; mode: Mode; suddenDeath: boolean }
  | { kind: 'suddenDeath'; players: PlayerId[] };

export const SPIN_SETTLE = 0.6;
export const SPIN_TICK = 12; // trocas de tema por segundo durante a roleta

export function roundLabel(round: number, totalRounds: number | null): string {
  return totalRounds === null ? `Rodada ${round}` : `Rodada ${round}/${totalRounds}`;
}

/** Texto do cabeçalho depois do tema. Morte súbita não vale pontos: mostra só o rótulo. */
export function headerText(
  q: Pick<ShownQuestion, 'value' | 'difficulty'>, round: number, totalRounds: number | null, mode: Mode, suddenDeath = false,
): string {
  if (suddenDeath) return 'MORTE SÚBITA';
  return mode === 'points'
    ? `${roundLabel(round, totalRounds)} · Vale ${q.value} pts`
    : `${roundLabel(round, totalRounds)} · Dificuldade ${q.difficulty}`;
}

/** Estado da partida → o que o telão desenha (null = nada a desenhar). `themes` são os temas ainda com perguntas. */
export function screenViewFor(state: GameState, clock: number, themes: string[]): ScreenView | null {
  const { phase } = state;
  const suddenDeath = state.suddenDeath !== null;
  if (phase === 'spin') {
    if (state.suddenDeath) return { kind: 'suddenDeath', players: state.suddenDeath };
    const settled = state.theme !== null && state.phaseTime <= SPIN_SETTLE;
    const list = themes.length > 0 ? themes : state.theme ? [state.theme] : [];
    const highlighted = settled ? (state.theme as string) : (list[Math.floor(clock * SPIN_TICK) % list.length] ?? '');
    return { kind: 'spin', themes: list, highlighted, round: state.round, totalRounds: state.totalRounds };
  }
  const q = state.question;
  if (!q) return null;
  const base = { q, round: state.round, totalRounds: state.totalRounds, mode: state.mode, suddenDeath };
  if (phase === 'question') return { kind: 'question', ...base, timeLeft: state.phaseTime };
  if (phase === 'lock') return { kind: 'question', ...base, timeLeft: 0 };
  if (phase === 'reveal' || phase === 'reset') return { kind: 'reveal', ...base };
  return null;
}
