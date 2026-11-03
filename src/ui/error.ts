import { button, h, stage, type ScreenCtl } from './dom';
import type { Nav } from './nav';

/** Erro com volta ao menu (erros do online), sem recarregar a página. */
export interface ErrorBack { text: string; onBack(): void }

/**
 * Tela de erro. `show(mensagem)` é o erro fatal (banco de perguntas, WebGL): "Tentar de novo" recarrega.
 * `show({ text, onBack })` oferece "Voltar ao menu" (também Esc / B).
 */
export function createError(nav: Nav): ScreenCtl {
  const msg = h('p', 'lead');
  let onBack: (() => void) | null = null;
  const retry = button('btn btn-accent', 'Tentar de novo', () => location.reload());
  const back = button('btn btn-accent', 'Voltar ao menu', () => onBack?.());
  const { el } = stage('error', h('h1', 'title', 'ALGO DEU ERRADO'), msg, retry, back);
  return {
    el,
    show(params) {
      const withBack = typeof params === 'object' && params !== null ? params as ErrorBack : null;
      onBack = withBack?.onBack ?? null;
      msg.textContent = withBack?.text ?? (typeof params === 'string' ? params : 'Não foi possível iniciar o jogo.');
      retry.hidden = withBack !== null;
      back.hidden = withBack === null;
      el.hidden = false;
      nav.setActive(el, onBack ? { onBack } : undefined); // foca o único botão visível
    },
    hide() { el.hidden = true; },
  };
}
