import { test, expect, describe } from 'vitest';
import { validateBank, QuestionPicker, toShown } from '../../src/core/questions';
import { createRng } from '../../src/core/rng';
import type { Question } from '../../src/core/types';

const example = {
  id: 'geo-001',
  theme: 'Geografia',
  difficulty: 2,
  text: 'Qual é o maior estado do Brasil em área?',
  options: ['Pará', 'Amazonas', 'Mato Grosso', 'Bahia'],
  correct: 1,
};

const bank = (...questions: unknown[]) => ({ version: 1, questions });

function q(id: string, theme: string, difficulty: 1 | 2 | 3): Question {
  return { id, theme, difficulty, text: `Pergunta ${id}?`, options: ['a', 'b', 'c', 'd'], correct: 2 };
}

describe('validateBank', () => {
  test('aceita a pergunta do exemplo da spec', () => {
    const r = validateBank(bank(example));
    expect(r.rejected).toEqual([]);
    expect(r.questions).toEqual([example]);
  });

  test.each([
    ['difficulty 4', { ...example, difficulty: 4 }, /difficulty/],
    ['3 opções', { ...example, options: ['a', 'b', 'c'] }, /options/],
    ['opção vazia', { ...example, options: ['a', '', 'c', 'd'] }, /options/],
    ['opções repetidas', { ...example, options: ['a', 'b', 'a', 'd'] }, /options/],
    ['correct 4', { ...example, correct: 4 }, /correct/],
  ])('rejeita %s com índice e motivo', (_name, bad, reason) => {
    const r = validateBank(bank(example, { ...bad, id: 'x-1' }));
    expect(r.questions).toEqual([example]);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].index).toBe(1);
    expect(r.rejected[0].reason).toMatch(reason);
  });

  test('rejeita id duplicado (a segunda ocorrência) e mantém a primeira', () => {
    const second = { ...example, text: 'Outra?' };
    const r = validateBank(bank(example, second));
    expect(r.questions).toEqual([example]);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].index).toBe(1);
    expect(r.rejected[0].reason).toMatch(/id/);
  });

  test.each([
    ['null', null],
    ['array', []],
    ['version 2', { version: 2, questions: [] }],
    ['sem questions', { version: 1 }],
    ['questions não é array', { version: 1, questions: {} }],
  ])('rejeita raiz inválida: %s', (_name, root) => {
    const r = validateBank(root);
    expect(r.questions).toEqual([]);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].reason).toMatch(/raiz|root/i);
  });

  test('aceita { version: 1, questions: [] }', () => {
    expect(validateBank({ version: 1, questions: [] })).toEqual({ questions: [], rejected: [] });
  });

  test('rejeita entradas que não são objetos', () => {
    const r = validateBank(bank(42, null));
    expect(r.rejected.map((x) => x.index)).toEqual([0, 1]);
  });
});

describe('QuestionPicker', () => {
  test('pickQuestion nunca repete', () => {
    const p = new QuestionPicker([q('a', 'X', 1), q('b', 'X', 1), q('c', 'X', 1)], createRng(1));
    const ids = [1, 2, 3, 4].map(() => p.pickQuestion('X', 1)?.id ?? null);
    expect(new Set(ids.slice(0, 3)).size).toBe(3);
    expect(ids[3]).toBeNull();
  });

  test('fallback: empate de distância vai para a menor dificuldade', () => {
    const p = new QuestionPicker([q('a', 'X', 1), q('b', 'X', 3)], createRng(1));
    expect(p.pickQuestion('X', 2)?.difficulty).toBe(1);
  });

  test('fallback: só dificuldade 3 e pedido 1', () => {
    const p = new QuestionPicker([q('a', 'X', 3)], createRng(1));
    expect(p.pickQuestion('X', 1)?.difficulty).toBe(3);
  });

  test('prefere a dificuldade pedida quando existe', () => {
    const p = new QuestionPicker([q('a', 'X', 1), q('b', 'X', 2), q('c', 'X', 3)], createRng(1));
    expect(p.pickQuestion('X', 3)?.id).toBe('c');
  });

  test('tema sem perguntas restantes ou desconhecido devolve null', () => {
    const p = new QuestionPicker([q('a', 'X', 1)], createRng(1));
    expect(p.pickQuestion('Y', 1)).toBeNull();
    p.pickQuestion('X', 1);
    expect(p.pickQuestion('X', 1)).toBeNull();
  });

  test('availableThemes remove tema esgotado e pickTheme devolve null no fim', () => {
    const p = new QuestionPicker([q('a', 'X', 1), q('b', 'Y', 2)], createRng(1));
    expect(p.availableThemes().sort()).toEqual(['X', 'Y']);
    p.pickQuestion('X', 1);
    expect(p.availableThemes()).toEqual(['Y']);
    expect(p.pickTheme()).toBe('Y');
    p.pickQuestion('Y', 2);
    expect(p.availableThemes()).toEqual([]);
    expect(p.pickTheme()).toBeNull();
  });

  test('pickTheme com semente fixa é reprodutível e cobre os temas', () => {
    const qs = [q('a', 'X', 1), q('b', 'Y', 1), q('c', 'Z', 1)];
    const run = (seed: number) => {
      const p = new QuestionPicker(qs, createRng(seed));
      return Array.from({ length: 20 }, () => p.pickTheme());
    };
    expect(run(7)).toEqual(run(7));
    expect(new Set(run(7))).toEqual(new Set(['X', 'Y', 'Z']));
  });
});

describe('toShown', () => {
  const base = validateBank(bank(example)).questions[0];

  test('a letra correta aponta para a mesma string, opções só reordenadas, value preservado', () => {
    for (let seed = 0; seed < 30; seed++) {
      const s = toShown(base, createRng(seed), 200);
      expect(s.options[['A', 'B', 'C', 'D'].indexOf(s.correct)]).toBe(base.options[base.correct]);
      expect([...s.options].sort()).toEqual([...base.options].sort());
      expect(s.value).toBe(200);
      expect(s.id).toBe(base.id);
      expect(s.theme).toBe(base.theme);
      expect(s.difficulty).toBe(base.difficulty);
      expect(s.text).toBe(base.text);
    }
  });

  test('embaralha de fato (alguma semente muda a ordem) e não muta o original', () => {
    const copy = [...base.options];
    const changed = Array.from({ length: 30 }, (_, i) => toShown(base, createRng(i), 100)).some(
      (s) => s.options.join() !== copy.join(),
    );
    expect(changed).toBe(true);
    expect([...base.options]).toEqual(copy);
  });
});
