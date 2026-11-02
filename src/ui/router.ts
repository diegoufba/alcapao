export type Screen = 'press-start' | 'menu' | 'options' | 'join' | 'match' | 'results';

export interface Router {
  go(s: Screen, params?: unknown): void;
  current(): Screen;
  /** Chamado a cada troca de tela, depois de `current()` já valer a nova. */
  onChange(cb: (s: Screen, params: unknown, from: Screen) => void): void;
}

export function createRouter(initial: Screen = 'press-start'): Router {
  let cur = initial;
  const listeners: ((s: Screen, params: unknown, from: Screen) => void)[] = [];
  return {
    go(s, params) {
      const from = cur;
      cur = s;
      for (const l of listeners) l(s, params, from);
    },
    current: () => cur,
    onChange: (cb) => { listeners.push(cb); },
  };
}
