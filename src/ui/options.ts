import { button, h, stage, type ScreenCtl } from './dom';
import type { Nav } from './nav';
import { AUDIO_DEFAULTS, type AudioSettings } from '../audio/settings';

interface OptionsDeps {
  nav: Nav;
  get(): AudioSettings;
  /** Aplica e salva as novas configurações. */
  set(next: AudioSettings): void;
  /** Toca o efeito de teste no canal de efeitos. */
  testSfx(): void;
  onBack(): void;
}

type Level = 'master' | 'music' | 'sfx' | 'ui';
const SLIDERS: [Level, string, string][] = [
  ['master', 'Geral', 'Volume de tudo'],
  ['music', 'Música', 'Trilhas do menu e da partida'],
  ['sfx', 'Efeitos', 'Empurrão, alçapão, timer…'],
  ['ui', 'Interface', 'Navegação nos menus'],
];

export function createOptions({ nav, get, set, testSfx, onBack }: OptionsDeps): ScreenCtl & { sync(): void } {
  const rows = SLIDERS.map(([key, label, hint]) => {
    const input = h('input', 'opt-range');
    input.type = 'range';
    input.id = `vol-${key}`;
    input.min = '0'; input.max = '100'; input.step = '5';
    const text = h('span', 'opt-value');
    const lab = h('label', 'opt-label', '', h('span', 'opt-name', label), h('span', 'opt-hint', hint));
    lab.htmlFor = input.id;
    input.addEventListener('input', () => { set({ ...get(), [key]: Number(input.value) / 100 }); sync(); });
    return { key, input, text, row: h('div', 'opt-row', '', lab, input, text) };
  });

  const knob = h('span', 'sw-knob');
  const mute = button('opt-mute', '', () => { set({ ...get(), muted: !get().muted }); sync(); });
  mute.append(h('span', 'sw-track', '', knob), 'Mudo');
  mute.setAttribute('aria-pressed', 'false');
  const sliders = h('div', 'opt-sliders', '', ...rows.map((r) => r.row));

  const test = button('btn btn-alt', 'Testar efeito', testSfx);
  const reset = button('btn btn-alt', 'Restaurar padrão', () => { set({ ...AUDIO_DEFAULTS }); sync(); });
  const back = button('btn btn-accent', 'VOLTAR', onBack);
  back.dataset.autofocus = '';

  const card = h('section', 'opt-card', '',
    h('div', 'opt-head', '', h('h2', '', 'Áudio'), h('div', 'grow'), mute),
    sliders,
    h('div', 'opt-foot', '', test, reset, h('div', 'grow'), h('span', 'opt-saved', 'Salvo automaticamente')));
  card.setAttribute('aria-label', 'Áudio');
  const { el } = stage('options',
    h('h1', 'title', 'OPÇÕES'),
    card,
    h('div', 'opt-back', '', back, h('span', 'hint', 'M liga e desliga o mudo a qualquer momento · Esc / B volta')));

  function sync(): void {
    const s = get();
    for (const r of rows) {
      r.input.value = String(Math.round(s[r.key] * 100));
      r.text.textContent = `${r.input.value}%`;
    }
    mute.setAttribute('aria-pressed', String(s.muted));
    mute.classList.toggle('is-on', s.muted);
    sliders.classList.toggle('is-muted', s.muted);
  }

  return {
    el,
    sync,
    show() { sync(); el.hidden = false; nav.setActive(el, { onBack }); },
    hide() { el.hidden = true; },
  };
}
