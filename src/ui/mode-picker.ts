import { button, h } from './dom';
import { emitUi, type Dir } from './nav';
import type { Mode } from '../core/types';
import type { Rounds } from '../net/protocol';

const ROUNDS: Rounds[] = [8, 12, 16];
const MODES: { id: Mode; label: string }[] = [{ id: 'survival', label: 'Sobrevivência' }, { id: 'points', label: 'Pontos' }];
const HINTS: Record<Mode, string> = {
  points: 'Ninguém é eliminado. Acertos valem 100 / 200 / 300 conforme a dificuldade.',
  survival: 'Errou, caiu fora. Vence o último de pé.',
};

export interface ModePicker {
  el: HTMLElement;
  get(): { mode: Mode; rounds: Rounds };
  /** Troca a escolha sem avisar `onChange` e volta o anel para a linha do modo. */
  set(mode: Mode, rounds: Rounds): void;
  /**
   * Direcional: cima/baixo escolhe a linha (só em Pontos), esquerda/direita troca o valor.
   * Só soa e avisa `onChange` quando algo muda; devolve se mudou (no limite, false).
   */
  dir(d: Dir): boolean;
  /** Desligado, os chips só mostram a escolha (cliente online). */
  setEditable(on: boolean): void;
  /** Mostra o anel na linha que os direcionais controlam. */
  showRow(on: boolean): void;
}

/** Modo (Sobrevivência / Pontos) e rodadas (8 / 12 / 16), com a dica do modo. Usado na entrada e no lobby. */
export function createModePicker(onChange: (mode: Mode, rounds: Rounds) => void): ModePicker {
  let mode: Mode = 'survival';
  let rounds: Rounds = 12;
  let row: 'mode' | 'rounds' = 'mode';
  let editable = true;
  let rowVisible = false;

  const changed = (): void => { emitUi('navegar'); render(); onChange(mode, rounds); };
  const modeChips = MODES.map((m) => {
    const b = button('chip', m.label, () => { mode = m.id; row = 'mode'; changed(); });
    return { id: m.id, b };
  });
  const roundChips = ROUNDS.map((r) => {
    const b = button('chip chip-num', String(r), () => { rounds = r; row = 'rounds'; changed(); });
    return { r, b };
  });
  const modeGroup = h('div', 'opt-group', '', h('span', 'opt-label', 'Modo'), ...modeChips.map((c) => c.b));
  modeGroup.setAttribute('role', 'group');
  modeGroup.setAttribute('aria-label', 'Modo de jogo');
  const roundsGroup = h('div', 'opt-group', '', h('span', 'opt-label', 'Rodadas'), ...roundChips.map((c) => c.b));
  roundsGroup.setAttribute('role', 'group');
  roundsGroup.setAttribute('aria-label', 'Número de rodadas');
  const hint = h('span', 'mode-hint');
  const el = h('div', 'opts', '', modeGroup, roundsGroup, hint);

  function render(): void {
    const points = mode === 'points';
    if (!points) row = 'mode';
    for (const c of modeChips) { c.b.classList.toggle('is-on', c.id === mode); c.b.setAttribute('aria-pressed', String(c.id === mode)); }
    for (const c of roundChips) { c.b.classList.toggle('is-on', c.r === rounds); c.b.setAttribute('aria-pressed', String(c.r === rounds)); }
    for (const b of [...modeChips, ...roundChips].map((c) => c.b)) b.disabled = !editable;
    el.classList.toggle('is-readonly', !editable);
    roundsGroup.hidden = !points;
    modeGroup.classList.toggle('is-row', rowVisible && editable && row === 'mode');
    roundsGroup.classList.toggle('is-row', rowVisible && editable && row === 'rounds');
    hint.textContent = HINTS[mode];
  }
  render();

  return {
    el,
    get: () => ({ mode, rounds }),
    set(m, r) { mode = m; rounds = r; row = 'mode'; render(); },
    dir(d) {
      if (!editable) return false;
      if (d === 'up' || d === 'down') {
        const next = d === 'down' ? 'rounds' : 'mode';
        if (mode !== 'points' || next === row) return false;
        row = next;
        emitUi('navegar');
        render();
        return true;
      }
      const step = d === 'right' ? 1 : -1;
      if (row === 'mode') {
        const i = MODES.findIndex((m) => m.id === mode);
        const next = MODES[Math.min(Math.max(i + step, 0), MODES.length - 1)].id;
        if (next === mode) return false;
        mode = next;
      } else {
        const i = ROUNDS.indexOf(rounds);
        const next = ROUNDS[Math.min(Math.max(i + step, 0), ROUNDS.length - 1)];
        if (next === rounds) return false;
        rounds = next;
      }
      changed();
      return true;
    },
    setEditable(on) { editable = on; render(); },
    showRow(on) { rowVisible = on; render(); },
  };
}
