import type { PadLike } from '../input/gamepad';

// ---------------------------------------------------------------------------
// Eventos de interface (o áudio da Tarefa 14 se pendura aqui)
// ---------------------------------------------------------------------------

export type UiEvent = 'navegar' | 'confirmar' | 'voltar' | 'entrou' | 'saiu';
const listeners = new Set<(e: UiEvent) => void>();

/** Registra um ouvinte de sons de interface; devolve a função que o remove. */
export function onUiEvent(cb: (e: UiEvent) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function emitUi(e: UiEvent): void {
  for (const l of listeners) l(e);
}

// ---------------------------------------------------------------------------
// Direções
// ---------------------------------------------------------------------------

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];

export const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};

export interface Rect { left: number; top: number; width: number; height: number }

/** Índice do vizinho mais próximo na direção dada (ignorando `skip`), ou -1. */
export function pickInDirection(from: Rect, cands: Rect[], dir: Dir, skip = -1): number {
  const fx = from.left + from.width / 2;
  const fy = from.top + from.height / 2;
  let best = -1;
  let bestScore = Infinity;
  cands.forEach((c, i) => {
    if (i === skip) return;
    const dx = c.left + c.width / 2 - fx;
    const dy = c.top + c.height / 2 - fy;
    const primary = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
    if (primary <= 1) return;
    const cross = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = primary + cross * 2;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
}

// ---------------------------------------------------------------------------
// Gamepad
// ---------------------------------------------------------------------------

export type PadEventKind = Dir | 'confirm' | 'back' | 'start' | 'select';
export interface PadEvent { pad: number; kind: PadEventKind }

const REPEAT_MS = 250;
const AXIS_THRESHOLD = 0.5;
const BUTTON_KINDS: [number, PadEventKind][] = [[0, 'confirm'], [1, 'back'], [8, 'select'], [9, 'start']];
const DPAD: Record<Dir, number> = { up: 12, down: 13, left: 14, right: 15 };

/** Traduz snapshots de gamepad em eventos de menu (D-pad e analógico com repetição). */
export class PadNav {
  private pads = new Map<number, { btn: boolean[]; next: Partial<Record<Dir, number>> }>();

  poll(pads: (PadLike | null)[], now: number): PadEvent[] {
    const events: PadEvent[] = [];
    const seen = new Set<number>();
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      seen.add(pad.index);
      const pressed = (i: number): boolean => pad.buttons[i]?.pressed ?? false;
      const ax = pad.axes[0] ?? 0;
      const az = pad.axes[1] ?? 0;
      const active: Record<Dir, boolean> = {
        up: pressed(DPAD.up) || az < -AXIS_THRESHOLD,
        down: pressed(DPAD.down) || az > AXIS_THRESHOLD,
        left: pressed(DPAD.left) || ax < -AXIS_THRESHOLD,
        right: pressed(DPAD.right) || ax > AXIS_THRESHOLD,
      };
      const cur = BUTTON_KINDS.map(([i]) => pressed(i));
      let st = this.pads.get(pad.index);
      if (!st) {
        // pad recém-visto: o que já está apertado não conta como evento
        st = { btn: cur, next: {} };
        for (const d of DIRS) if (active[d]) st.next[d] = Infinity;
        this.pads.set(pad.index, st);
        continue;
      }
      BUTTON_KINDS.forEach(([, kind], k) => {
        if (cur[k] && !st.btn[k]) events.push({ pad: pad.index, kind });
      });
      st.btn = cur;
      for (const d of DIRS) {
        if (!active[d]) { delete st.next[d]; continue; }
        const next = st.next[d];
        if (next === undefined || now >= next) {
          events.push({ pad: pad.index, kind: d });
          st.next[d] = now + REPEAT_MS;
        }
      }
    }
    for (const index of [...this.pads.keys()]) if (!seen.has(index)) this.pads.delete(index);
    return events;
  }
}

// ---------------------------------------------------------------------------
// Navegação por foco sobre <button>s reais
// ---------------------------------------------------------------------------

export interface Nav {
  /** Define a região navegável (null = nenhuma) e foca o botão `[data-autofocus]` ou o primeiro. */
  setActive(root: HTMLElement | null, opts?: { onBack?: () => void }): void;
  /** Tecla (KeyboardEvent.code) → true se foi tratada. */
  key(code: string): boolean;
  /** Evento de gamepad → true se foi tratado. */
  pad(kind: PadEventKind): boolean;
}

export function createNav(): Nav {
  let root: HTMLElement | null = null;
  let onBack: (() => void) | undefined;

  type Item = HTMLButtonElement | HTMLInputElement
  const items = (): Item[] =>
    root ? [...root.querySelectorAll<Item>('button, input[type="range"], input[type="text"]')].filter((b) => !b.disabled && b.getClientRects().length > 0) : [];
  const rectOf = (b: HTMLElement): Rect => b.getBoundingClientRect();

  /** Esquerda/direita num controle deslizante em foco muda o valor em vez de mudar o foco. */
  function slide(dir: Dir): boolean {
    const a = document.activeElement;
    if (!root || !(a instanceof HTMLInputElement) || a.type !== 'range' || !root.contains(a)) return false;
    if (dir !== 'left' && dir !== 'right') return false;
    const before = a.value;
    if (dir === 'left') a.stepDown(); else a.stepUp();
    if (a.value !== before) { a.dispatchEvent(new Event('input', { bubbles: true })); emitUi('navegar'); }
    return true;
  }

  function move(dir: Dir): boolean {
    if (slide(dir)) return true;
    const list = items();
    if (list.length === 0) return false;
    const i = list.indexOf(document.activeElement as Item);
    if (i < 0) { list[0].focus(); emitUi('navegar'); return true; }
    const j = pickInDirection(rectOf(list[i]), list.map(rectOf), dir, i);
    if (j >= 0) { list[j].focus(); emitUi('navegar'); }
    return true;
  }

  function confirm(): boolean {
    const a = document.activeElement;
    if (!root || !(a instanceof HTMLButtonElement) || !root.contains(a) || a.disabled) return false;
    a.click(); // o som de 'confirmar' sai do ouvinte de clique da raiz da interface
    return true;
  }

  function back(): boolean {
    if (!root || !onBack) return false;
    emitUi('voltar');
    onBack();
    return true;
  }

  return {
    setActive(r, opts) {
      root = r;
      onBack = opts?.onBack;
      if (r) (r.querySelector<HTMLElement>('[data-autofocus]') ?? items()[0])?.focus();
    },
    key(code) {
      const dir = KEY_DIRS[code];
      if (dir) return move(dir);
      if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') return confirm();
      if (code === 'Escape') return back();
      return false;
    },
    pad(kind) {
      if (kind === 'confirm') return confirm();
      if (kind === 'back') return back();
      if (kind === 'start' || kind === 'select') return false;
      return move(kind);
    },
  };
}
