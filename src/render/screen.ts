import * as THREE from 'three';
import type { ShownQuestion, Zone } from '../core/types';
import { headerText, roundLabel, type ScreenView } from './screen-view';
import { ACCENT, INK, PLAYER_COLORS, YELLOW, ZONE_STYLE, drawZoneShape, flatMaterial } from './scene';

export type { ScreenView };

const W = 1600;
const H = 600;
const MUTED = '#5A5276';
const ZONES: Zone[] = ['A', 'B', 'C', 'D'];
const TITLE = '"Titan One"';
const BODY = 'Nunito';

const SCREEN_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SCREEN_FRAGMENT = `
uniform sampler2D uMap;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec4 tex = texture2D(uMap, vUv);
  vec3 col = tex.rgb;

  // Grade sutil de LEDs / scanlines do telão de TV. Some quando cada célula ocupa poucos pixels na tela,
  // senão vira moiré (faixas horizontais sobre o texto).
  vec2 cells = vUv * vec2(320.0, 120.0);
  vec2 cellPx = fwidth(cells);
  float gridFade = 1.0 - smoothstep(0.2, 0.4, max(cellPx.x, cellPx.y));
  vec2 grid = fract(cells) - 0.5;
  float cell = 1.0 - smoothstep(0.32, 0.5, max(abs(grid.x), abs(grid.y)));
  float lines = vUv.y * 300.0;
  float scanFade = 1.0 - smoothstep(0.2, 0.4, fwidth(lines));
  float scan = 0.96 + 0.04 * sin(lines * 6.28318);
  col *= mix(1.0, mix(0.93, 1.03, cell), gridFade) * mix(1.0, scan, scanFade);

  // Reflexo diagonal suave (sheen) passando pela tela periodicamente
  float sweepPos = mod(uTime * 0.45, 3.2) - 0.8;
  float sheen = smoothstep(0.18, 0.0, abs((vUv.x + vUv.y * 0.45) - sweepPos));
  col += vec3(1.0) * sheen * 0.09;

  // Vinheta sutil nas bordas da tela
  vec2 d = vUv * 2.0 - 1.0;
  float vig = 1.0 - dot(d, d) * 0.08;
  col *= clamp(vig, 0.85, 1.0);

  gl_FragColor = vec4(col, tex.a);
  #include <colorspace_fragment>
}
`;

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}

/** Caixa no estilo das telas: sombra dura deslocada, preenchimento e contorno escuro. */
function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, shadow = 6): void {
  if (shadow) { ctx.fillStyle = INK; rr(ctx, x + shadow, y + shadow, w, h, r); ctx.fill(); }
  ctx.fillStyle = fill; rr(ctx, x, y, w, h, r); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke();
}

/** Texto com contorno escuro grosso, como os títulos das telas. */
function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, stroke: number): void {
  ctx.lineJoin = 'round'; ctx.lineWidth = stroke; ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function drawHeader(ctx: CanvasRenderingContext2D, chip: string, label: string): void {
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = `36px ${TITLE}`;
  const chipW = ctx.measureText(chip.toUpperCase()).width + 44;
  box(ctx, 50, 44, chipW, 70, 16, YELLOW, 0);
  ctx.fillStyle = INK; ctx.fillText(chip.toUpperCase(), 72, 82);
  ctx.fillStyle = MUTED; ctx.font = `700 34px ${BODY}`;
  ctx.fillText(label, 50 + chipW + 30, 82);
}

function drawQuestionBody(ctx: CanvasRenderingContext2D, q: ShownQuestion, reveal: boolean): void {
  ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = `60px ${TITLE}`;
  let lines = wrap(ctx, q.text, 1380);
  let lineH = 78;
  if (lines.length > 1) { ctx.font = `48px ${TITLE}`; lines = wrap(ctx, q.text, 1500); lineH = 60; }
  const y0 = lines.length > 1 ? 166 : 196;
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, 50, y0 + i * lineH));

  ZONES.forEach((zone, i) => {
    const x = 50 + (i % 2) * 760, y = 290 + Math.floor(i / 2) * 140;
    const ok = reveal && zone === q.correct;
    const { color } = ZONE_STYLE[zone];
    ctx.globalAlpha = reveal && !ok ? 0.35 : 1;
    box(ctx, x, y, 730, 110, 20, color, ok ? 10 : 6);
    if (ok) { ctx.lineWidth = 8; ctx.strokeStyle = '#FFFFFF'; rr(ctx, x + 10, y + 10, 710, 90, 14); ctx.stroke(); }
    drawZoneShape(ctx, zone, x + 62, y + 56, 46);
    ctx.fillStyle = zone === 'C' ? INK : '#FFFFFF'; ctx.font = `800 46px ${BODY}`; ctx.textAlign = 'left';
    ctx.fillText(q.options[i], x + 112, y + 57, 590);
    ctx.globalAlpha = 1;
  });
}

function drawView(ctx: CanvasRenderingContext2D, view: ScreenView): void {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#FFFFFF'); bg.addColorStop(1, '#EEE9FF');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';

  if (view.kind === 'question' || view.kind === 'reveal') {
    const { q } = view;
    drawHeader(ctx, q.theme, headerText(q, view.round, view.totalRounds, view.mode, view.suddenDeath));
    if (view.kind === 'reveal') {
      ctx.font = `40px ${TITLE}`; ctx.textAlign = 'right';
      outlined(ctx, 'RESPOSTA', W - 130, 84, ACCENT, 10);
      drawZoneShape(ctx, q.correct, W - 82, 84, 64, ZONE_STYLE[q.correct].color);
    } else {
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(W - 99, 90, 54, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.arc(W - 105, 84, 54, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke();
      ctx.font = `48px ${TITLE}`; ctx.textAlign = 'center';
      outlined(ctx, String(Math.max(0, Math.ceil(view.timeLeft))).padStart(2, '0'), W - 105, 88, '#FFFFFF', 8);
    }
    drawQuestionBody(ctx, q, view.kind === 'reveal');
  } else if (view.kind === 'spin') {
    ctx.fillStyle = MUTED; ctx.font = `700 34px ${BODY}`;
    ctx.fillText(roundLabel(view.round, view.totalRounds), 50, 82);
    ctx.font = `76px ${TITLE}`; ctx.textAlign = 'center';
    outlined(ctx, 'SORTEANDO O TEMA', W / 2, 190, '#FFFFFF', 14);
    // faixa horizontal de temas, com quebra de linha se não couber
    ctx.font = `38px ${TITLE}`;
    const gap = 24, pad = 36;
    const widths = view.themes.map(t => ctx.measureText(t.toUpperCase()).width + pad * 2);
    const rows: number[][] = [[]];
    let rowW = 0;
    widths.forEach((w, i) => {
      if (rows[rows.length - 1].length && rowW + gap + w > 1500) { rows.push([]); rowW = 0; }
      rows[rows.length - 1].push(i); rowW += (rowW ? gap : 0) + w;
    });
    rows.forEach((row, r) => {
      const total = row.reduce((s, i) => s + widths[i], 0) + gap * (row.length - 1);
      let x = (W - total) / 2;
      const y = 330 + r * 110;
      for (const i of row) {
        const on = view.themes[i] === view.highlighted;
        box(ctx, x, y - 42, widths[i], 84, 18, on ? YELLOW : '#FFFFFF', on ? 6 : 0);
        ctx.fillStyle = on ? INK : MUTED; ctx.textAlign = 'left';
        ctx.fillText(view.themes[i].toUpperCase(), x + pad, y + 2);
        x += widths[i] + gap;
      }
    });
  } else {
    ctx.font = `120px ${TITLE}`; ctx.textAlign = 'center';
    outlined(ctx, 'MORTE SÚBITA', W / 2, 190, ACCENT, 20);
    ctx.font = `110px ${TITLE}`;
    const gap = 80;
    const ids = view.players;
    const widths = ids.map(id => ctx.measureText(id).width);
    let x = (W - (widths.reduce((s, w) => s + w, 0) + gap * (ids.length - 1))) / 2;
    ids.forEach((id, i) => {
      ctx.textAlign = 'left'; outlined(ctx, id, x, 400, PLAYER_COLORS[id], 18);
      x += widths[i] + gap;
    });
  }
}

// O timer só muda a cada segundo inteiro; o resto da view é comparado pelo conteúdo.
function viewKey(view: ScreenView): string {
  return JSON.stringify(view.kind === 'question' ? { ...view, timeLeft: Math.ceil(view.timeLeft) } : view);
}

export function createScreen(scene: THREE.Scene): { draw(view: ScreenView): void; update(dt: number): void } {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (ctx) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H); } // telão vazio claro até a primeira view

  let last: ScreenView | null = null;
  let lastKey = '';

  function paint(): void {
    if (!ctx || !last) return;
    drawView(ctx, last);
    texture.needsUpdate = true;
  }

  function draw(view: ScreenView): void {
    const key = viewKey(view);
    if (key === lastKey) return;
    last = view; lastKey = key;
    paint();
  }

  // As fontes embutidas carregam de forma assíncrona: redesenha quando chegarem.
  void Promise.all([document.fonts.load(`40px ${TITLE}`), document.fonts.load(`700 40px ${BODY}`), document.fonts.load(`800 40px ${BODY}`)])
    .then(paint)
    .catch(() => {});

  const uTime = { value: 0 };
  const faceMat = new THREE.ShaderMaterial({
    vertexShader: SCREEN_VERTEX,
    fragmentShader: SCREEN_FRAGMENT,
    uniforms: {
      uMap: { value: texture },
      uTime,
    },
  });

  // Moldura laranja com faixa de lâmpadas no topo e contorno escuro em volta da tela.
  const tel = new THREE.Group();
  const outline = new THREE.Mesh(new THREE.BoxGeometry(17.4, 7.8, 0.4), flatMaterial(INK));
  outline.position.set(0, 0.3, -0.06); tel.add(outline);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(17, 7.4, 0.5), flatMaterial(ACCENT, { emissive: ACCENT, emissiveIntensity: 0.35 }));
  frame.position.y = 0.3; tel.add(frame);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(17, 0.42, 0.52), flatMaterial('#FF9A7A', { emissive: '#FF9A7A', emissiveIntensity: 0.35 }));
  strip.position.y = 3.6; tel.add(strip);
  const bulbGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#FFF3C4' });
  for (let i = 0; i < 21; i++) {
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(-8 + i * 0.8, 3.6, 0.28); tel.add(bulb);
  }
  const border = new THREE.Mesh(new THREE.PlaneGeometry(16.3, 6.3), new THREE.MeshBasicMaterial({ color: INK }));
  border.position.z = 0.255; tel.add(border);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), faceMat);
  face.position.z = 0.26; tel.add(face);
  for (const s of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 0.5), flatMaterial('#2A2540'));
    pole.position.set(7.6 * s, -5, -0.2); tel.add(pole);
  }
  tel.position.set(0, 5.4, -8.2); tel.rotation.x = 0.18;
  tel.traverse(o => { if (o instanceof THREE.Mesh && o !== face && o !== border && o.material !== bulbMat) { o.receiveShadow = true; } });
  scene.add(tel);

  function update(dt: number): void {
    uTime.value += Math.min(dt, 0.1);
  }

  return { draw, update };
}
