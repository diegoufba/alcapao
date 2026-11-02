import { test, expect, describe } from 'vitest';
import { headerText, screenViewFor } from '../../src/render/screen-view';
import type { GameState, ShownQuestion } from '../../src/core/types';

const q: ShownQuestion = { id: 'q', theme: 'Tema', difficulty: 2, text: 't', options: ['a', 'b', 'c', 'd'], correct: 'A', value: 200 };

function state(over: Partial<GameState> = {}): GameState {
  return {
    mode: 'points', phase: 'question', phaseTime: 10, round: 5, totalRounds: 12,
    players: [], theme: 'Tema', question: q, suddenDeath: null, ...over,
  };
}

describe('headerText', () => {
  test('Pontos: rodada/total e valor', () => {
    expect(headerText(q, 5, 12, 'points')).toBe('Rodada 5/12 · Vale 200 pts');
  });
  test('Sobrevivência: rodada e dificuldade', () => {
    expect(headerText(q, 4, null, 'survival')).toBe('Rodada 4 · Dificuldade 2');
  });
  test('morte súbita: só o rótulo, sem rodada 13/12 nem pontos', () => {
    expect(headerText(q, 13, 12, 'points', true)).toBe('MORTE SÚBITA');
  });
});

describe('screenViewFor', () => {
  test('pergunta e revelação carregam suddenDeath', () => {
    expect(screenViewFor(state(), 0, [])).toMatchObject({ kind: 'question', suddenDeath: false });
    expect(screenViewFor(state({ phase: 'reveal', suddenDeath: ['P1', 'P2'], round: 13 }), 0, [])).toMatchObject({ kind: 'reveal', suddenDeath: true });
    expect(screenViewFor(state({ phase: 'lock' }), 0, [])).toMatchObject({ kind: 'question', timeLeft: 0 });
  });
  test('roleta usa os temas disponíveis e para no tema sorteado', () => {
    const v = screenViewFor(state({ phase: 'spin', phaseTime: 0.3, theme: 'B', question: null }), 0, ['A', 'B']);
    expect(v).toMatchObject({ kind: 'spin', themes: ['A', 'B'], highlighted: 'B' });
    const rolling = screenViewFor(state({ phase: 'spin', phaseTime: 2, theme: 'B', question: null }), 0, ['A', 'B']);
    expect(rolling).toMatchObject({ kind: 'spin', highlighted: 'A' });
  });
  test('roleta da morte súbita mostra os finalistas', () => {
    expect(screenViewFor(state({ phase: 'spin', suddenDeath: ['P1', 'P3'] }), 0, ['A'])).toEqual({ kind: 'suddenDeath', players: ['P1', 'P3'] });
  });
});
