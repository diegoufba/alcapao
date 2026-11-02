import { SPAWNS, zoneOf } from './arena';
import { stepPhysics, resetPhysicsMemory } from './physics';
import { createRng } from './rng';
import { QuestionPicker, toShown } from './questions';
import { resolvePoints, resolveSurvival, survivalRanking, pointsRanking, topTie } from './rules';
import { POINTS, PHASE_TIME, QUESTION_TIME, difficultyFor } from './schedule';
import type {
  GameEvent, GameState, Phase, PlayerId, PlayerInput, PlayerState, Question, RankEntry, Zone,
} from './types';

export type GameConfig =
  | { mode: 'survival'; players: PlayerId[]; seed: number }
  | { mode: 'points'; rounds: 8 | 12 | 16; players: PlayerId[]; seed: number };

export interface Game {
  readonly state: GameState;
  step(dt: number, inputs: Partial<Record<PlayerId, PlayerInput>>): GameEvent[];
  /** Temas que ainda têm perguntas (a roleta mostra só estes). */
  availableThemes(): string[];
  /** Pula para o fim da fase atual (o próximo step já entra na fase seguinte). */
  debugSkipPhase(): void;
}

type Scores = Partial<Record<PlayerId, number>>;
const EPS = 1e-9; // tolera erro de ponto flutuante ao somar 1/60 s repetidamente

function newPlayer(id: PlayerId): PlayerState {
  return {
    id, pos: { ...SPAWNS[id] }, vel: { x: 0, z: 0 }, facing: 0, inPlay: true, fallen: false,
    score: 0, pushCooldown: 0, frozen: 0, knockTime: 0, knockVel: { x: 0, z: 0 },
  };
}

export function createGame(config: GameConfig, questions: Question[]): Game {
  resetPhysicsMemory();
  const rng = createRng(config.seed);
  const picker = new QuestionPicker(questions, rng);
  const points = config.mode === 'points';
  const solo = config.players.length === 1;
  const state: GameState = {
    mode: config.mode, phase: 'spin', phaseTime: PHASE_TIME.spin, round: 1,
    totalRounds: points ? config.rounds : null,
    players: config.players.map(newPlayer), theme: null, question: null, suddenDeath: null,
  };
  const eliminations: { id: PlayerId; round: number }[] = []; // só Sobrevivência
  let lockedZones: Partial<Record<PlayerId, Zone | null>> = {};
  let started = false;
  let events: GameEvent[] = [];

  const isOver = (): boolean => state.phase === 'over'; // função: evita estreitamento de tipo do TS
  const emit = (e: GameEvent): void => { events.push(e); };
  const inPlayIds = (): PlayerId[] => state.players.filter((p) => p.inPlay).map((p) => p.id);
  const scores = (): Scores => Object.fromEntries(state.players.map((p) => [p.id, p.score]));

  function gameOver(ranking: RankEntry[], extra: { roundsSurvived?: number; scores?: Scores }): void {
    state.phase = 'over';
    state.phaseTime = 0;
    emit({ type: 'phaseChanged', phase: 'over' });
    emit({ type: 'gameOver', ranking, ...extra });
  }

  /** §2.6: sem perguntas disponíveis. */
  function exhausted(): void {
    if (!points) {
      const ranking = survivalRanking(inPlayIds(), eliminations);
      gameOver(ranking, solo ? { roundsSurvived: state.round - 1 } : {});
      return;
    }
    const sc = scores();
    const contenders = state.suddenDeath;
    if (contenders === null) {
      gameOver(pointsRanking(sc, null), { scores: sc });
      return;
    }
    const sharing = inPlayIds();
    const rest = Object.fromEntries(Object.entries(sc).filter(([id]) => !sharing.includes(id as PlayerId)));
    const ranking: RankEntry[] = [
      ...sharing.map((id) => ({ pos: 1, id, score: sc[id] ?? 0 })),
      ...pointsRanking(rest, null).map((r) => ({ ...r, pos: r.pos + sharing.length })),
    ];
    gameOver(ranking, { scores: sc });
  }

  function enter(phase: Phase): void {
    if (phase === 'question') {
      const difficulty = difficultyFor(state.mode, state.round, state.totalRounds, state.suddenDeath !== null);
      const q = state.theme === null ? null : picker.pickQuestion(state.theme, difficulty);
      if (q === null) { exhausted(); return; }
      state.question = toShown(q, rng, POINTS[q.difficulty]);
      state.phaseTime = QUESTION_TIME[q.difficulty];
    } else if (phase === 'spin') {
      const theme = picker.pickTheme();
      if (theme === null) { exhausted(); return; }
      state.theme = theme;
      state.question = null;
      state.phaseTime = PHASE_TIME.spin;
    } else {
      state.phaseTime = PHASE_TIME[phase as 'lock' | 'reveal' | 'reset'];
    }
    state.phase = phase;
    emit({ type: 'phaseChanged', phase });

    if (phase === 'spin') emit({ type: 'themeChosen', theme: state.theme as string });
    else if (phase === 'question') emit({ type: 'questionShown', question: state.question! });
    else if (phase === 'lock') lock();
    else if (phase === 'reveal') reveal();
    else if (phase === 'reset') reset();
  }

  function lock(): void {
    lockedZones = {};
    for (const p of state.players) if (p.inPlay) lockedZones[p.id] = zoneOf(p.pos);
    emit({ type: 'locked', zones: lockedZones });
  }

  function reveal(): void {
    const correct = state.question!.correct;
    const contenders = inPlayIds();
    let fallen: PlayerId[];
    let voided = false;
    const scored: Scores = {};
    if (points && state.suddenDeath === null) {
      const r = resolvePoints(contenders, lockedZones, correct, state.question!.value);
      fallen = r.fallen;
      Object.assign(scored, r.scored);
    } else {
      ({ fallen, voided } = resolveSurvival(contenders, lockedZones, correct));
    }
    for (const p of state.players) {
      if (fallen.includes(p.id)) p.fallen = true;
      p.score += scored[p.id] ?? 0;
    }
    if (!points) for (const id of fallen) eliminations.push({ id, round: state.round });
    emit({ type: 'revealed', correct, fallen, voided, scored });
  }

  function reset(): void {
    if (!points || state.suddenDeath !== null) return;
    const fallen = state.players.filter((p) => p.fallen);
    for (const p of fallen) { // reaparece no slot, caindo do alto (o flag `fallen` só cai no fim do RESET)
      p.pos = { ...SPAWNS[p.id] };
      p.vel = { x: 0, z: 0 };
      p.knockVel = { x: 0, z: 0 };
      p.knockTime = 0;
      p.frozen = 0;
    }
    if (fallen.length > 0) emit({ type: 'respawned', players: fallen.map((p) => p.id) });
  }

  /** Fim do RESET: reposiciona, limpa a rodada e decide o que vem. */
  function endReset(): void {
    const eliminate = !points || state.suddenDeath !== null;
    for (const p of state.players) {
      if (p.fallen && eliminate) p.inPlay = false;
      p.fallen = false;
      if (!p.inPlay) continue;
      p.pos = { ...SPAWNS[p.id] };
      p.vel = { x: 0, z: 0 };
      p.knockVel = { x: 0, z: 0 };
      p.knockTime = 0;
      p.frozen = 0;
    }
    const alive = inPlayIds();

    if (!points) {
      if (solo ? alive.length === 0 : alive.length === 1) {
        const ranking = survivalRanking(solo ? [] : alive, eliminations);
        gameOver(ranking, solo ? { roundsSurvived: state.round - 1 } : {});
        return;
      }
    } else if (state.suddenDeath !== null) {
      if (alive.length === 1) {
        const sc = scores();
        gameOver(pointsRanking(sc, alive[0]), { scores: sc });
        return;
      }
    } else if (state.round === state.totalRounds) {
      const sc = scores();
      const tied = topTie(sc);
      if (tied.length <= 1) {
        gameOver(pointsRanking(sc, null), { scores: sc });
        return;
      }
      state.suddenDeath = tied;
      for (const p of state.players) if (!tied.includes(p.id)) p.inPlay = false;
      emit({ type: 'suddenDeathStarted', players: tied });
    }
    state.round++;
    enter('spin');
  }

  function endPhase(): void {
    switch (state.phase) {
      case 'spin': enter('question'); break;
      case 'question': enter('lock'); break;
      case 'lock': enter('reveal'); break;
      case 'reveal': enter('reset'); break;
      case 'reset': endReset(); break;
      case 'over': break;
    }
  }

  return {
    state,
    step(dt, inputs) {
      if (isOver()) return [];
      events = [];
      if (!started) { started = true; enter('spin'); }
      if (isOver()) return events;
      const q = state.phase === 'question';
      events.push(...stepPhysics(state.players, inputs, dt, { allowMove: q, allowPush: q }));
      state.phaseTime -= dt;
      if (state.phaseTime <= EPS) endPhase();
      return events;
    },
    availableThemes: () => picker.availableThemes(),
    debugSkipPhase() {
      state.phaseTime = 0;
    },
  };
}
