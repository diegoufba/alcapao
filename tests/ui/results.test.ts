import { test, expect } from 'vitest';
import { listIds, tiedWith } from '../../src/ui/results';

test('listIds junta nomes em português', () => {
  expect(listIds([])).toBe('');
  expect(listIds(['P2'])).toBe('P2');
  expect(listIds(['P2', 'P3'])).toBe('P2 e P3');
  expect(listIds(['P2', 'P3', 'P4'])).toBe('P2, P3 e P4');
});

test('tiedWith lista todos que empataram no topo com o vencedor da morte súbita', () => {
  const ranking = [
    { pos: 1, id: 'P1' as const, score: 500 },
    { pos: 2, id: 'P2' as const, score: 500 },
    { pos: 2, id: 'P3' as const, score: 500 },
    { pos: 4, id: 'P4' as const, score: 200 },
  ];
  expect(tiedWith(ranking)).toEqual(['P2', 'P3']);
});
