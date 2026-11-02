export type PlayerId = 'P1' | 'P2' | 'P3' | 'P4';
export type Zone = 'A' | 'B' | 'C' | 'D';
export type Mode = 'survival' | 'points';
export type Phase = 'spin' | 'question' | 'lock' | 'reveal' | 'reset' | 'over';
export type Difficulty = 1 | 2 | 3;

export interface Vec2 { x: number; z: number }
export interface PlayerInput { move: Vec2; push: boolean } // push = apertou neste frame

export interface PlayerState {
  id: PlayerId; pos: Vec2; vel: Vec2; facing: number; // facing em rad, 0 = +z
  inPlay: boolean; // false = eliminado ou espectador da morte súbita
  fallen: boolean; // caiu nesta rodada (até o RESET)
  score: number; pushCooldown: number; frozen: number; knockTime: number; knockVel: Vec2;
}

export interface Question {
  id: string; theme: string; difficulty: Difficulty; text: string;
  options: [string, string, string, string]; correct: 0 | 1 | 2 | 3;
}

export interface ShownQuestion {
  id: string; theme: string; difficulty: Difficulty; text: string;
  options: [string, string, string, string]; correct: Zone; value: number;
}

export interface RankEntry { pos: number; id: PlayerId; score?: number; eliminatedRound?: number }

export interface GameState {
  mode: Mode; phase: Phase; phaseTime: number; round: number; totalRounds: number | null;
  players: PlayerState[]; theme: string | null; question: ShownQuestion | null;
  suddenDeath: PlayerId[] | null;
}

export type GameEvent =
  | { type: 'phaseChanged'; phase: Phase }
  | { type: 'themeChosen'; theme: string }
  | { type: 'questionShown'; question: ShownQuestion }
  | { type: 'pushed'; by: PlayerId; targets: PlayerId[] }
  | { type: 'bumped'; a: PlayerId; b: PlayerId }
  | { type: 'locked'; zones: Partial<Record<PlayerId, Zone | null>> }
  | { type: 'revealed'; correct: Zone; fallen: PlayerId[]; voided: boolean; scored: Partial<Record<PlayerId, number>> }
  | { type: 'respawned'; players: PlayerId[] }
  | { type: 'suddenDeathStarted'; players: PlayerId[] }
  | { type: 'gameOver'; ranking: RankEntry[]; roundsSurvived?: number; scores?: Partial<Record<PlayerId, number>> };
