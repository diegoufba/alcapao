import type { Question } from '../../src/core/types';

/** Banco de perguntas de teste: 5 temas com `perTheme` perguntas cada. */
export function bank(perTheme = 6): Question[] {
  const out: Question[] = [];
  for (let t = 0; t < 5; t++) {
    for (let i = 0; i < perTheme; i++) {
      out.push({
        id: `t${t}-${i}`, theme: `Tema${t}`, difficulty: (Math.floor(i / 2) + 1) as 1 | 2 | 3,
        text: `Pergunta ${t}-${i}`, options: ['a', 'b', 'c', 'd'], correct: (i % 4) as 0 | 1 | 2 | 3,
      });
    }
  }
  return out;
}
