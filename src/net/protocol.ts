import type { GameConfig } from '../core/game';
import type {
  GameEvent, GameState, Mode, PlayerId, PlayerState, Question, RankEntry, ShownQuestion, Vec2, Zone,
} from '../core/types';

export const PROTOCOL_VERSION = 1;

export type Rounds = 8 | 12 | 16;
export interface LobbyInfo { players: PlayerId[]; mode: Mode; rounds: Rounds; started: boolean }

export type ClientMsg =
  | { t: 'hello'; protocol: number; build: string }
  | { t: 'input'; move: Vec2; pushCount: number }
  | { t: 'ping'; at: number }
  | { t: 'bye' };

export type HostMsg =
  | { t: 'welcome'; you: PlayerId }
  | { t: 'lobby'; lobby: LobbyInfo }
  | { t: 'start'; config: GameConfig }
  | { t: 'events'; tick: number; events: GameEvent[] }
  | { t: 'snap'; tick: number; state: GameState; themes?: string[] }
  | { t: 'pong'; at: number }
  | { t: 'left'; id: PlayerId }
  | { t: 'rejected'; reason: 'full' | 'started' | 'version' }
  | { t: 'closed' };

export function encode(m: ClientMsg | HostMsg): string {
  return JSON.stringify(m);
}

/** Identifica o banco de perguntas: FNV-1a 32 bits, em hex, sobre os ids na ordem do banco unidos por '\n'. Vai em `hello.build`. */
export function bankHash(bank: Question[]): string {
  const texto = bank.map((q) => q.id).join('\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// --- validação (tudo que vem da rede é não confiável) ---

type Obj = Record<string, unknown>;

const PLAYER_IDS: readonly string[] = ['P1', 'P2', 'P3', 'P4'];
const ZONES: readonly string[] = ['A', 'B', 'C', 'D'];
const MODES: readonly string[] = ['survival', 'points'];
const PHASES: readonly string[] = ['spin', 'question', 'lock', 'reveal', 'reset', 'over'];

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isPlayerId = (v: unknown): v is PlayerId => isStr(v) && PLAYER_IDS.includes(v);
const isZone = (v: unknown): v is Zone => isStr(v) && ZONES.includes(v);
const isMode = (v: unknown): v is Mode => isStr(v) && MODES.includes(v);
const isPhase = (v: unknown): boolean => isStr(v) && PHASES.includes(v);
const isArrayOf = (v: unknown, ok: (x: unknown) => boolean): boolean => Array.isArray(v) && v.every(ok);
const isPlayerIdList = (v: unknown): v is PlayerId[] => isArrayOf(v, isPlayerId);
const isVec2 = (v: unknown): v is Vec2 => isObj(v) && isNum(v.x) && isNum(v.z);

/** Objeto parcial indexado por PlayerId: chaves válidas e valores aceitos por `ok`. */
function isPlayerRecord(v: unknown, ok: (x: unknown) => boolean): boolean {
  return isObj(v) && Object.entries(v).every(([k, x]) => PLAYER_IDS.includes(k) && ok(x));
}

function isShownQuestion(v: unknown): v is ShownQuestion {
  return isObj(v) && isStr(v.id) && isStr(v.theme) && (v.difficulty === 1 || v.difficulty === 2 || v.difficulty === 3)
    && isStr(v.text) && Array.isArray(v.options) && v.options.length === 4 && v.options.every(isStr)
    && isZone(v.correct) && isNum(v.value);
}

function isPlayerState(v: unknown): v is PlayerState {
  return isObj(v) && isPlayerId(v.id) && isVec2(v.pos) && isVec2(v.vel) && isNum(v.facing)
    && typeof v.inPlay === 'boolean' && typeof v.fallen === 'boolean'
    && isNum(v.score) && isNum(v.pushCooldown) && isNum(v.frozen) && isNum(v.knockTime) && isVec2(v.knockVel);
}

function isGameState(v: unknown): v is GameState {
  return isObj(v) && isMode(v.mode) && isPhase(v.phase) && isNum(v.phaseTime) && isNum(v.round)
    && (v.totalRounds === null || isNum(v.totalRounds))
    && isArrayOf(v.players, isPlayerState)
    && (v.theme === null || isStr(v.theme))
    && (v.question === null || isShownQuestion(v.question))
    && (v.suddenDeath === null || isPlayerIdList(v.suddenDeath));
}

function isRankEntry(v: unknown): v is RankEntry {
  return isObj(v) && isNum(v.pos) && isPlayerId(v.id)
    && (v.score === undefined || isNum(v.score))
    && (v.eliminatedRound === undefined || isNum(v.eliminatedRound));
}

function isGameEvent(v: unknown): v is GameEvent {
  if (!isObj(v)) return false;
  switch (v.type) {
    case 'phaseChanged': return isPhase(v.phase);
    case 'themeChosen': return isStr(v.theme);
    case 'questionShown': return isShownQuestion(v.question);
    case 'pushed': return isPlayerId(v.by) && isPlayerIdList(v.targets);
    case 'bumped': return isPlayerId(v.a) && isPlayerId(v.b);
    case 'locked': return isPlayerRecord(v.zones, (z) => z === null || isZone(z));
    case 'revealed':
      return isZone(v.correct) && isPlayerIdList(v.fallen) && typeof v.voided === 'boolean'
        && isPlayerRecord(v.scored, isNum);
    case 'respawned': return isPlayerIdList(v.players);
    case 'suddenDeathStarted': return isPlayerIdList(v.players);
    case 'gameOver':
      return isArrayOf(v.ranking, isRankEntry)
        && (v.roundsSurvived === undefined || isNum(v.roundsSurvived))
        && (v.scores === undefined || isPlayerRecord(v.scores, isNum));
    default: return false;
  }
}

function isGameConfig(v: unknown): v is GameConfig {
  if (!isObj(v) || !isMode(v.mode) || !isNum(v.seed)) return false;
  if (!isPlayerIdList(v.players) || v.players.length === 0 || new Set(v.players).size !== v.players.length) return false;
  return v.mode === 'survival' || v.rounds === 8 || v.rounds === 12 || v.rounds === 16;
}

function isLobbyInfo(v: unknown): v is LobbyInfo {
  return isObj(v) && isPlayerIdList(v.players) && isMode(v.mode)
    && (v.rounds === 8 || v.rounds === 12 || v.rounds === 16) && typeof v.started === 'boolean';
}

function parse(raw: string): Obj | null {
  try {
    const v: unknown = JSON.parse(raw);
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

export function decodeClient(raw: string): ClientMsg | null {
  const m = parse(raw);
  if (!m) return null;
  switch (m.t) {
    case 'hello': return isNum(m.protocol) && isStr(m.build) ? { t: 'hello', protocol: m.protocol, build: m.build } : null;
    case 'input': return isVec2(m.move) && isNum(m.pushCount) ? { t: 'input', move: m.move, pushCount: m.pushCount } : null;
    case 'ping': return isNum(m.at) ? { t: 'ping', at: m.at } : null;
    case 'bye': return { t: 'bye' };
    default: return null;
  }
}

export function decodeHost(raw: string): HostMsg | null {
  const m = parse(raw);
  if (!m) return null;
  switch (m.t) {
    case 'welcome': return isPlayerId(m.you) ? { t: 'welcome', you: m.you } : null;
    case 'lobby': return isLobbyInfo(m.lobby) ? { t: 'lobby', lobby: m.lobby } : null;
    case 'start': return isGameConfig(m.config) ? { t: 'start', config: m.config } : null;
    case 'events':
      return isNum(m.tick) && isArrayOf(m.events, isGameEvent) ? { t: 'events', tick: m.tick, events: m.events as GameEvent[] } : null;
    case 'snap':
      if (!isNum(m.tick) || !isGameState(m.state)) return null;
      if (m.themes === undefined) return { t: 'snap', tick: m.tick, state: m.state };
      return isArrayOf(m.themes, isStr) ? { t: 'snap', tick: m.tick, state: m.state, themes: m.themes as string[] } : null;
    case 'pong': return isNum(m.at) ? { t: 'pong', at: m.at } : null;
    case 'left': return isPlayerId(m.id) ? { t: 'left', id: m.id } : null;
    case 'rejected':
      return m.reason === 'full' || m.reason === 'started' || m.reason === 'version' ? { t: 'rejected', reason: m.reason } : null;
    case 'closed': return { t: 'closed' };
    default: return null;
  }
}
