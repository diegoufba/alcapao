/** Cria um elemento com classe, texto e filhos opcionais. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls = '', text = '', ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  e.append(...children);
  return e;
}

export function button(cls: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export function portrait(file: string, cls = '', alt = ''): HTMLImageElement {
  const i = h('img', cls);
  i.src = `/img/${file}.png`;
  i.alt = alt;
  if (!alt) i.setAttribute('aria-hidden', 'true');
  return i;
}

export const fmt = (n: number): string => n.toLocaleString('pt-BR');

/** Uma tela de interface: uma <section> que o roteador mostra e esconde. */
export interface ScreenCtl {
  el: HTMLElement;
  show(params?: unknown): void;
  hide(): void;
}

/** Monta <section class="screen"><div class="stage">…</div></section>. */
export function stage(name: string, ...children: (Node | string)[]): { el: HTMLElement; stage: HTMLElement } {
  const st = h('div', 'stage', '', ...children);
  const el = h('section', `screen screen-${name}`, '', st);
  el.hidden = true;
  return { el, stage: st };
}
