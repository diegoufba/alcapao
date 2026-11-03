import { button, h, stage, type ScreenCtl } from './dom';
import { emitUi, KEY_DIRS, type Nav } from './nav';
import { normalizeRoomCode, ROOM_CODE_LENGTH } from '../net/room-code';

/** `show({ code })` preenche o campo; `connecting` já abre no "Conectando…" (atalhos de desenvolvimento). */
export interface OnlineParams { code?: string; connecting?: boolean }

export interface OnlineScreen extends ScreenCtl {
  /** Tecla (KeyboardEvent.code) → true se foi tratada. No campo de código, as letras ficam com o campo. */
  key(code: string): boolean;
}

interface OnlineDeps { nav: Nav; onCreate(): void; onJoin(code: string): void; onBack(): void }

/** O que foi digitado, em maiúsculas, sem espaços, hífens e o que não for letra, no máximo 5 letras. */
const typed = (raw: string): string => raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, ROOM_CODE_LENGTH);

export function createOnline({ nav, onCreate, onJoin, onBack }: OnlineDeps): OnlineScreen {
  let busy = false;

  const input = h('input', 'code-input');
  input.type = 'text';
  input.placeholder = 'ABCDE';
  input.autocomplete = 'off';
  input.spellcheck = false;
  // teclado do celular: já abre em maiúsculas e mostra "ir" no lugar do Enter
  input.setAttribute('autocapitalize', 'characters');
  input.inputMode = 'text';
  input.enterKeyHint = 'go';
  input.setAttribute('aria-label', 'Código da sala');
  const create = button('btn btn-accent', 'CRIAR SALA', () => {
    if (busy) return;
    setBusy(true);
    onCreate();
  });
  const enter = button('btn btn-accent', 'ENTRAR', () => tryJoin());
  const status = h('p', 'online-status', 'Conectando…');

  const { el, stage: st } = stage('online',
    h('div', 'join-head', '', h('h1', 'title', 'JOGAR ONLINE'),
      h('p', 'lead', 'Cada um joga no seu computador, até 4 pessoas na mesma sala')),
    h('div', 'online-cards', '',
      h('div', 'online-card', '',
        h('h2', '', 'Criar sala'),
        h('p', 'online-text', 'Você é o host (P1). Depois é só mandar o link ou o código para quem vai jogar.'),
        create),
      h('div', 'online-card', '',
        h('h2', '', 'Entrar com código'),
        h('p', 'online-text', 'Digite as 5 letras que o host mostra no lobby.'),
        input,
        enter)),
    status,
    h('p', 'hint', 'Esc / B volta ao menu'));

  function render(): void {
    create.disabled = busy;
    input.disabled = busy;
    enter.disabled = busy || normalizeRoomCode(input.value) === null;
    status.classList.toggle('is-on', busy);
  }

  function setBusy(on: boolean): void {
    busy = on;
    render();
  }

  function tryJoin(): void {
    const code = normalizeRoomCode(input.value);
    if (busy || !code) return;
    setBusy(true);
    onJoin(code);
  }

  input.addEventListener('input', () => {
    input.value = typed(input.value);
    render();
  });

  const back = (): void => { emitUi('voltar'); onBack(); };

  /**
   * Teclado: ordem fixa CRIAR SALA → campo → ENTRAR (pulando o que estiver desativado), em vez da busca
   * geométrica do nav, que com os dois cartões lado a lado não achava o campo pela seta para baixo e não saía dele.
   */
  function step(delta: 1 | -1): boolean {
    const order = [create, input, enter].filter((x) => !x.disabled);
    if (order.length === 0) return true;
    const i = order.indexOf(document.activeElement as HTMLButtonElement | HTMLInputElement);
    const next = order[i < 0 ? 0 : (i + delta + order.length) % order.length];
    if (next !== document.activeElement) { next.focus(); emitUi('navegar'); }
    return true;
  }

  return {
    el,
    show(params) {
      const p = (params ?? {}) as OnlineParams;
      input.value = typed(p.code ?? '');
      busy = p.connecting === true;
      render();
      el.hidden = false;
      delete create.dataset.autofocus;
      delete enter.dataset.autofocus;
      (enter.disabled ? create : enter).dataset.autofocus = '';
      nav.setActive(st, { onBack: () => onBack() });
    },
    hide() { el.hidden = true; },
    key(code) {
      const a = document.activeElement;
      if (a === input) {
        if (code === 'Enter' || code === 'NumpadEnter') { tryJoin(); return true; }
        if (code === 'Escape') { back(); return true; }
        if (code === 'ArrowUp') return step(-1);
        if (code === 'ArrowDown' || code === 'Tab') return step(1);
        return false; // letras, Backspace, setas laterais: com o campo
      }
      if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
        if (a instanceof HTMLButtonElement && st.contains(a) && !a.disabled) a.click();
        return true;
      }
      if (code === 'Escape') { back(); return true; }
      const dir = KEY_DIRS[code];
      if (dir) return step(dir === 'down' || dir === 'right' ? 1 : -1);
      if (code === 'Tab') return step(1);
      return false;
    },
  };
}
