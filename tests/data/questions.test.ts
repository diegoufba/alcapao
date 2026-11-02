import { test, expect, describe } from 'vitest';
import bank from '../../src/data/questions.json';
import { validateBank } from '../../src/core/questions';

const THEMES = ['Geografia', 'História', 'Ciências', 'Esportes', 'Entretenimento', 'Tecnologia'];
const MAX_TEXT = 90;
const MAX_OPTION = 28;

describe('banco inicial de perguntas', () => {
  const { questions, rejected } = validateBank(bank);

  test('todas as 120 perguntas são válidas', () => {
    expect(rejected).toEqual([]);
    expect(questions).toHaveLength(120);
  });

  test.each(THEMES)('%s tem 8 fáceis, 7 médias e 5 difíceis', (theme) => {
    const count = (d: number) => questions.filter((q) => q.theme === theme && q.difficulty === d).length;
    expect([count(1), count(2), count(3)]).toEqual([8, 7, 5]);
  });

  test('só existem os 6 temas', () => {
    expect([...new Set(questions.map((q) => q.theme))].sort()).toEqual([...THEMES].sort());
  });

  test('ids seguem o padrão tema-NNN', () => {
    for (const q of questions) expect(q.id).toMatch(/^(geo|his|cie|esp|ent|tec)-\d{3}$/);
  });

  test('nenhum texto se repete', () => {
    expect(new Set(questions.map((q) => q.text)).size).toBe(questions.length);
  });

  test(`textos cabem no telão (pergunta ≤ ${MAX_TEXT}, opção ≤ ${MAX_OPTION} caracteres)`, () => {
    const tooLong = questions.flatMap((q) => [
      ...(q.text.length > MAX_TEXT ? [`${q.id}: ${q.text}`] : []),
      ...q.options.filter((o) => o.length > MAX_OPTION).map((o) => `${q.id}: ${o}`),
    ]);
    expect(tooLong).toEqual([]);
  });

  test('geo-001 é a pergunta do exemplo da spec', () => {
    expect(questions.find((q) => q.id === 'geo-001')).toEqual({
      id: 'geo-001',
      theme: 'Geografia',
      difficulty: 2,
      text: 'Qual é o maior estado do Brasil em área?',
      options: ['Pará', 'Amazonas', 'Mato Grosso', 'Bahia'],
      correct: 1,
    });
  });
});
