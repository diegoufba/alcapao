import { AUDIO_HINT, h, portrait, stage, type ScreenCtl } from './dom';

const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(w: number, paths: string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', `0 0 ${w} 20`);
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', '#C5CBEA');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}

const KEYBOARD = ['M4.5 1.5h19a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-19a3 3 0 0 1-3-3v-11a3 3 0 0 1 3-3z', 'M6 7h2M11 7h2M16 7h2M21 7h1M7 13h14'];
const GAMEPAD = ['M8 3h14a6 6 0 0 1 6 6v3a5 5 0 0 1-9 3l-1-1h-6l-1 1a5 5 0 0 1-9-3V9a6 6 0 0 1 6-6z', 'M8 8v4M6 10h4', 'M21 9h.01M23.5 11.5h.01'];
const HEADSET = ['M3 11a8 8 0 0 1 16 0', 'M3.5 11h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z', 'M16.5 11h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z'];

export function createPressStart(): ScreenCtl {
  const chars = h('div', 'ps-chars', '', ...(['P1', 'P2', 'P3', 'P4'] as const).map((id) => portrait(id)));
  const legend = h('div', 'ps-legend', '',
    h('span', '', '', icon(28, KEYBOARD), 'Teclado'),
    h('span', '', '', icon(30, GAMEPAD), 'Gamepad'),
    h('span', '', '', icon(22, HEADSET), 'O som liga quando você apertar'));
  const { el, stage: st } = stage('press-start',
    chars,
    h('h1', 'ps-logo', 'ALÇAPÃO'),
    h('div', 'ps-cta', 'APERTE QUALQUER TECLA OU BOTÃO'),
    legend);
  st.append(h('span', 'ps-version', 'v0.1 · protótipo'), h('p', 'audio-hint', AUDIO_HINT));
  return { el, show() { el.hidden = false; }, hide() { el.hidden = true; } };
}
