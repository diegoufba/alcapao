import type { Difficulty, Question, ShownQuestion, Zone } from './types';
import { shuffle, type Rng } from './rng';

export interface BankRejection { index: number; reason: string }
export interface BankResult { questions: Question[]; rejected: BankRejection[] }

const ZONES: readonly Zone[] = ['A', 'B', 'C', 'D'];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/** Devolve o motivo da rejeição, ou null se a pergunta for válida. */
function problem(raw: unknown, seenIds: Set<string>): string | null {
  if (!isObject(raw)) return 'pergunta não é um objeto';
  if (!nonEmptyString(raw.id)) return 'id ausente ou vazio';
  if (seenIds.has(raw.id)) return `id duplicado: ${raw.id}`;
  if (!nonEmptyString(raw.theme)) return 'theme ausente ou vazio';
  if (!nonEmptyString(raw.text)) return 'text ausente ou vazio';
  if (raw.difficulty !== 1 && raw.difficulty !== 2 && raw.difficulty !== 3) {
    return 'difficulty deve ser 1, 2 ou 3';
  }
  const { options } = raw;
  if (!Array.isArray(options) || options.length !== 4) return 'options deve ter exatamente 4 itens';
  if (!options.every(nonEmptyString)) return 'options não pode ter item vazio';
  if (new Set(options).size !== 4) return 'options não pode ter itens repetidos';
  if (raw.correct !== 0 && raw.correct !== 1 && raw.correct !== 2 && raw.correct !== 3) {
    return 'correct deve ser 0, 1, 2 ou 3';
  }
  return null;
}

/** Valida o banco; perguntas inválidas vão para `rejected` (a raiz inválida usa index -1). */
export function validateBank(raw: unknown): BankResult {
  if (!isObject(raw) || raw.version !== 1 || !Array.isArray(raw.questions)) {
    return { questions: [], rejected: [{ index: -1, reason: 'raiz inválida: esperado { version: 1, questions: [] }' }] };
  }
  const questions: Question[] = [];
  const rejected: BankRejection[] = [];
  const seenIds = new Set<string>();
  raw.questions.forEach((item: unknown, index: number) => {
    const reason = problem(item, seenIds);
    if (reason) {
      rejected.push({ index, reason });
      return;
    }
    const q = item as Question;
    seenIds.add(q.id);
    questions.push(q);
  });
  return { questions, rejected };
}

export class QuestionPicker {
  private readonly pool = new Map<string, Question[]>(); // tema -> perguntas não usadas

  constructor(questions: Question[], private readonly rng: Rng) {
    for (const q of questions) {
      const list = this.pool.get(q.theme);
      if (list) list.push(q);
      else this.pool.set(q.theme, [q]);
    }
  }

  availableThemes(): string[] {
    return [...this.pool.entries()].filter(([, list]) => list.length > 0).map(([theme]) => theme);
  }

  pickTheme(): string | null {
    const themes = this.availableThemes();
    if (themes.length === 0) return null;
    return themes[Math.floor(this.rng() * themes.length)];
  }

  /** Sorteia na dificuldade pedida, ou na mais próxima (empate → a menor), e marca como usada. */
  pickQuestion(theme: string, difficulty: Difficulty): Question | null {
    const list = this.pool.get(theme);
    if (!list || list.length === 0) return null;
    let best: Difficulty | null = null;
    for (const d of [1, 2, 3] as const) {
      if (!list.some((q) => q.difficulty === d)) continue;
      if (best === null || Math.abs(d - difficulty) < Math.abs(best - difficulty)) best = d;
    }
    if (best === null) return null;
    const candidates = list.filter((q) => q.difficulty === best);
    const chosen = candidates[Math.floor(this.rng() * candidates.length)];
    list.splice(list.indexOf(chosen), 1);
    return chosen;
  }
}

/** Embaralha as opções; `correct` vira a letra (A-D) da nova posição da resposta certa. */
export function toShown(q: Question, rng: Rng, value: number): ShownQuestion {
  const order = shuffle([0, 1, 2, 3], rng);
  const options = order.map((i) => q.options[i]) as ShownQuestion['options'];
  return {
    id: q.id,
    theme: q.theme,
    difficulty: q.difficulty,
    text: q.text,
    options,
    correct: ZONES[order.indexOf(q.correct)],
    value,
  };
}
