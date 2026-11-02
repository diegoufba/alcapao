import { button, h, stage, type ScreenCtl } from './dom';
import type { Nav } from './nav';

/** Tela de erro fatal (banco de perguntas ausente ou vazio). `show(mensagem)`. */
export function createError(nav: Nav): ScreenCtl {
  const msg = h('p', 'lead');
  const retry = button('btn btn-accent', 'Tentar de novo', () => location.reload());
  retry.dataset.autofocus = '';
  const { el } = stage('error', h('h1', 'title', 'ALGO DEU ERRADO'), msg, retry);
  return {
    el,
    show(params) {
      msg.textContent = typeof params === 'string' ? params : 'Não foi possível iniciar o jogo.';
      el.hidden = false;
      nav.setActive(el);
    },
    hide() { el.hidden = true; },
  };
}
