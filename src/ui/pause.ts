import { button, h, stage, type ScreenCtl } from './dom';
import type { Nav } from './nav';

export function createPause(nav: Nav, onResume: () => void, onQuit: () => void): ScreenCtl {
  const resume = button('btn btn-accent', 'Continuar', onResume);
  resume.dataset.autofocus = '';
  const { el } = stage('pause',
    h('h1', 'title', 'PAUSADO'),
    h('div', 'menu-list', '', resume, button('btn btn-alt', 'Sair para o menu', onQuit)),
    h('p', 'hint', 'Esc / Start continua'));
  return {
    el,
    show() { el.hidden = false; nav.setActive(el, { onBack: onResume }); },
    hide() { el.hidden = true; },
  };
}
