import { button, h, stage, type ScreenCtl } from './dom';
import type { Nav } from './nav';

/** Pausa. `show({ online: true })` é o overlay da partida online: o jogo segue por trás e o botão sai da sala. */
export function createPause(nav: Nav, onResume: () => void, onQuit: () => void): ScreenCtl {
  const resume = button('btn btn-accent', 'Continuar', onResume);
  resume.dataset.autofocus = '';
  const title = h('h1', 'title');
  const lead = h('p', 'lead', 'A partida online não pausa: os outros continuam jogando.');
  const quit = button('btn btn-alt', '', onQuit);
  const hint = h('p', 'hint');
  const { el } = stage('pause', title, lead, h('div', 'menu-list', '', resume, quit), hint);
  return {
    el,
    show(params) {
      const online = typeof params === 'object' && params !== null && (params as { online?: boolean }).online === true;
      el.classList.toggle('is-online', online);
      title.textContent = online ? 'PARTIDA ONLINE' : 'PAUSADO';
      lead.hidden = !online;
      quit.textContent = online ? 'Sair da sala' : 'Sair para o menu';
      hint.textContent = online ? 'Esc / Start volta ao jogo' : 'Esc / Start continua';
      el.hidden = false;
      nav.setActive(el, { onBack: onResume });
    },
    hide() { el.hidden = true; },
  };
}
