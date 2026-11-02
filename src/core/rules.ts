import type { PlayerId, RankEntry, Zone } from './types';

type Zones = Partial<Record<PlayerId, Zone | null>>;
type Scores = Partial<Record<PlayerId, number>>;

const byId = (a: PlayerId, b: PlayerId): number => a.localeCompare(b);

export function resolveSurvival(
  contenders: PlayerId[],
  zones: Zones,
  correct: Zone,
): { fallen: PlayerId[]; voided: boolean } {
  const wrong = contenders.filter((id) => zones[id] !== correct);
  if (contenders.length >= 2 && wrong.length === contenders.length) {
    return { fallen: [], voided: true };
  }
  return { fallen: wrong, voided: false };
}

export function resolvePoints(
  players: PlayerId[],
  zones: Zones,
  correct: Zone,
  value: number,
): { fallen: PlayerId[]; scored: Scores } {
  const fallen: PlayerId[] = [];
  const scored: Scores = {};
  for (const id of players) {
    if (zones[id] === correct) scored[id] = value;
    else fallen.push(id);
  }
  return { fallen, scored };
}

export function survivalRanking(
  winners: PlayerId[],
  eliminations: { id: PlayerId; round: number }[],
): RankEntry[] {
  const ranking: RankEntry[] = [...winners].sort(byId).map((id) => ({ pos: 1, id }));
  const eliminated = [...eliminations].sort((a, b) => b.round - a.round || byId(a.id, b.id));
  eliminated.forEach((e, i) => {
    const sameAsPrev = i > 0 && eliminated[i - 1].round === e.round;
    const pos = sameAsPrev ? ranking[ranking.length - 1].pos : ranking.length + 1;
    ranking.push({ pos, id: e.id, eliminatedRound: e.round });
  });
  return ranking;
}

export function pointsRanking(scores: Scores, suddenDeathWinner: PlayerId | null): RankEntry[] {
  const ranking: RankEntry[] = [];
  if (suddenDeathWinner !== null) {
    ranking.push({ pos: 1, id: suddenDeathWinner, score: scores[suddenDeathWinner] ?? 0 });
  }
  const others = (Object.keys(scores) as PlayerId[])
    .filter((id) => id !== suddenDeathWinner)
    .map((id) => ({ id, score: scores[id] ?? 0 }))
    .sort((a, b) => b.score - a.score || byId(a.id, b.id));
  others.forEach((e, i) => {
    const sameAsPrev = i > 0 && others[i - 1].score === e.score;
    const pos = sameAsPrev ? ranking[ranking.length - 1].pos : ranking.length + 1;
    ranking.push({ pos, id: e.id, score: e.score });
  });
  return ranking;
}

export function topTie(scores: Scores): PlayerId[] {
  const ids = Object.keys(scores) as PlayerId[];
  if (ids.length === 0) return [];
  const max = Math.max(...ids.map((id) => scores[id] ?? 0));
  return ids.filter((id) => (scores[id] ?? 0) === max).sort(byId);
}
