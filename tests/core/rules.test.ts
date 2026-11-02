import { test, expect, describe } from 'vitest';
import {
  resolveSurvival, resolvePoints, survivalRanking, pointsRanking, topTie,
} from '../../src/core/rules';

describe('resolveSurvival', () => {
  test('quem erra ou fica sem resposta cai', () => {
    const r = resolveSurvival(['P1', 'P2', 'P3'], { P1: 'B', P2: 'A', P3: null }, 'B');
    expect(r).toEqual({ fallen: ['P2', 'P3'], voided: false });
  });

  test('todos errando com 2 ou mais anula a rodada', () => {
    const r = resolveSurvival(['P1', 'P2'], { P1: 'A', P2: null }, 'B');
    expect(r).toEqual({ fallen: [], voided: true });
  });

  test('solo errando cai e não anula', () => {
    expect(resolveSurvival(['P1'], { P1: 'A' }, 'B')).toEqual({ fallen: ['P1'], voided: false });
  });

  test('zona ausente no mapa conta como erro', () => {
    expect(resolveSurvival(['P1', 'P2'], { P1: 'B' }, 'B')).toEqual({ fallen: ['P2'], voided: false });
  });

  test('mantém a ordem da lista de entrada', () => {
    const r = resolveSurvival(['P4', 'P2', 'P3'], { P3: 'B' }, 'B');
    expect(r.fallen).toEqual(['P4', 'P2']);
  });
});

describe('resolvePoints', () => {
  test('acerto pontua e erro cai', () => {
    expect(resolvePoints(['P1', 'P2'], { P1: 'C', P2: 'A' }, 'C', 200))
      .toEqual({ fallen: ['P2'], scored: { P1: 200 } });
  });

  test('todos errando: todos caem, sem anulação', () => {
    expect(resolvePoints(['P1', 'P2'], { P1: 'A' }, 'C', 100))
      .toEqual({ fallen: ['P1', 'P2'], scored: {} });
  });
});

describe('survivalRanking', () => {
  test('vencedor em 1º, demais por rodada de eliminação decrescente com empate', () => {
    const r = survivalRanking(['P1'], [
      { id: 'P3', round: 5 }, { id: 'P2', round: 9 }, { id: 'P4', round: 5 },
    ]);
    expect(r).toEqual([
      { pos: 1, id: 'P1' },
      { pos: 2, id: 'P2', eliminatedRound: 9 },
      { pos: 3, id: 'P3', eliminatedRound: 5 },
      { pos: 3, id: 'P4', eliminatedRound: 5 },
    ]);
  });

  test('vencedores empatados dividem o 1º lugar e o próximo pula', () => {
    const r = survivalRanking(['P2', 'P1'], [{ id: 'P3', round: 4 }]);
    expect(r.map((e) => [e.id, e.pos])).toEqual([['P1', 1], ['P2', 1], ['P3', 3]]);
  });
});

describe('pointsRanking', () => {
  const scores = { P1: 1900, P3: 1900, P2: 1400, P4: 1100 } as const;

  test('vencedor da morte súbita fica em 1º', () => {
    const r = pointsRanking(scores, 'P1');
    expect(r.map((e) => [e.id, e.pos])).toEqual([['P1', 1], ['P3', 2], ['P2', 3], ['P4', 4]]);
    expect(r[0].score).toBe(1900);
  });

  test('sem vencedor, ranking de competição', () => {
    const r = pointsRanking(scores, null);
    expect(r.map((e) => [e.id, e.pos])).toEqual([['P1', 1], ['P3', 1], ['P2', 3], ['P4', 4]]);
  });
});

describe('topTie', () => {
  test('retorna os empatados no topo', () => {
    expect(topTie({ P1: 500, P2: 500, P3: 100 })).toEqual(['P1', 'P2']);
  });

  test('mapa vazio dá lista vazia', () => {
    expect(topTie({})).toEqual([]);
  });
});
