import { button, h, stage, type ScreenCtl } from './dom';
import type { Nav } from './nav';

/** Marcador de lugar: a Tarefa 14 troca o conteúdo pelos controles de áudio. */
export function createOptions(nav: Nav, onBack: () => void): ScreenCtl {
  const back = button('btn btn-accent', 'VOLTAR', onBack);
  back.dataset.autofocus = '';
  const { el } = stage('options',
    h('h1', 'title', 'OPÇÕES'),
    h('p', 'lead', 'Em breve.'),
    back);
  return {
    el,
    show() { el.hidden = false; nav.setActive(el, { onBack }); },
    hide() { el.hidden = true; },
  };
}
