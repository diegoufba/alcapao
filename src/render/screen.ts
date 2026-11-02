import * as THREE from 'three';
import type { ShownQuestion, Zone } from '../core/types';
import { headerText, roundLabel, type ScreenView } from './screen-view';
import { ACCENT, PLAYER_COLORS, flatMaterial } from './scene';

export type { ScreenView };

const W = 1600;
const H = 600;
const TEXT = '#EEF0FF';
const ZONES: Zone[] = ['A', 'B', 'C', 'D'];

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
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
  ctx.font = '38px Bungee';
  const chipW = ctx.measureText(chip.toUpperCase()).width + 44;
  ctx.fillStyle = ACCENT; rr(ctx, 50, 44, chipW, 70, 12); ctx.fill();
  ctx.fillStyle = '#141413'; ctx.fillText(chip.toUpperCase(), 72, 82);
  ctx.fillStyle = '#A9B0D6'; ctx.font = '500 34px Rubik';
  ctx.fillText(label, 50 + chipW + 30, 82);
}

function drawQuestionBody(ctx: CanvasRenderingContext2D, q: ShownQuestion, reveal: boolean): void {
  ctx.fillStyle = TEXT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = '600 64px Rubik';
  let lines = wrap(ctx, q.text, 1500);
  let lineH = 78;
  if (lines.length > 1) { ctx.font = '600 52px Rubik'; lines = wrap(ctx, q.text, 1500); lineH = 62; }
  const y0 = lines.length > 1 ? 168 : 200;
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, 50, y0 + i * lineH));

  ZONES.forEach((l, i) => {
    const x = 50 + (i % 2) * 760, y = 290 + Math.floor(i / 2) * 140;
    const ok = reveal && l === q.correct;
    ctx.globalAlpha = reveal && !ok ? 0.4 : 1;
    ctx.fillStyle = ok ? ACCENT : '#1F2546'; rr(ctx, x, y, 740, 116, 16); ctx.fill();
    ctx.fillStyle = ok ? '#141413' : '#2E3666'; rr(ctx, x + 16, y + 16, 84, 84, 12); ctx.fill();
    ctx.fillStyle = ok ? ACCENT : TEXT; ctx.font = '44px Bungee'; ctx.textAlign = 'center';
    ctx.fillText(l, x + 58, y + 62);
    ctx.fillStyle = ok ? '#141413' : TEXT; ctx.font = '500 48px Rubik'; ctx.textAlign = 'left';
    ctx.fillText(q.options[i], x + 126, y + 60, 596);
    ctx.globalAlpha = 1;
  });
}

function drawView(ctx: CanvasRenderingContext2D, view: ScreenView): void {
  ctx.fillStyle = '#161B33'; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';

  if (view.kind === 'question' || view.kind === 'reveal') {
    const { q } = view;
    drawHeader(ctx, q.theme, headerText(q, view.round, view.totalRounds, view.mode, view.suddenDeath));
    if (view.kind === 'reveal') {
      ctx.fillStyle = ACCENT; ctx.font = '44px Bungee'; ctx.textAlign = 'right';
      ctx.fillText(`RESPOSTA: ${q.correct}`, W - 50, 82);
    } else {
      ctx.strokeStyle = ACCENT; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.arc(W - 105, 84, 52, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = TEXT; ctx.font = '48px Bungee'; ctx.textAlign = 'center';
      ctx.fillText(String(Math.max(0, Math.ceil(view.timeLeft))).padStart(2, '0'), W - 105, 88);
    }
    drawQuestionBody(ctx, q, view.kind === 'reveal');
  } else if (view.kind === 'spin') {
    ctx.fillStyle = '#A9B0D6'; ctx.font = '500 34px Rubik';
    ctx.fillText(roundLabel(view.round, view.totalRounds), 50, 82);
    ctx.fillStyle = TEXT; ctx.font = '72px Bungee'; ctx.textAlign = 'center';
    ctx.fillText('SORTEANDO O TEMA', W / 2, 190);
    // faixa horizontal de temas, com quebra de linha se não couber
    ctx.font = '40px Bungee';
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
        ctx.fillStyle = on ? ACCENT : '#1F2546'; rr(ctx, x, y - 42, widths[i], 84, 16); ctx.fill();
        ctx.fillStyle = on ? '#141413' : '#8E9AD8'; ctx.textAlign = 'left';
        ctx.fillText(view.themes[i].toUpperCase(), x + pad, y + 2);
        x += widths[i] + gap;
      }
    });
  } else {
    ctx.fillStyle = ACCENT; ctx.font = '120px Bungee'; ctx.textAlign = 'center';
    ctx.fillText('MORTE SÚBITA', W / 2, 190);
    ctx.font = '110px Bungee';
    const gap = 80;
    const ids = view.players;
    const widths = ids.map(id => ctx.measureText(id).width);
    let x = (W - (widths.reduce((s, w) => s + w, 0) + gap * (ids.length - 1))) / 2;
    ids.forEach((id, i) => {
      ctx.fillStyle = PLAYER_COLORS[id]; ctx.textAlign = 'left'; ctx.fillText(id, x, 400);
      x += widths[i] + gap;
    });
  }
}

// O timer só muda a cada segundo inteiro; o resto da view é comparado pelo conteúdo.
function viewKey(view: ScreenView): string {
  return JSON.stringify(view.kind === 'question' ? { ...view, timeLeft: Math.ceil(view.timeLeft) } : view);
}

export function createScreen(scene: THREE.Scene): { draw(view: ScreenView): void } {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

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
  void Promise.all([document.fonts.load('40px Bungee'), document.fonts.load('600 40px Rubik'), document.fonts.load('500 40px Rubik')])
    .then(paint)
    .catch(() => {});

  const tel = new THREE.Group();
  tel.add(new THREE.Mesh(new THREE.BoxGeometry(17, 6.8, 0.5), flatMaterial('#2A3157')));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshBasicMaterial({ map: texture }));
  face.position.z = 0.26; tel.add(face);
  for (const s of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 0.5), flatMaterial('#2A3157'));
    pole.position.set(7.6 * s, -5, -0.2); tel.add(pole);
  }
  tel.position.set(0, 5.4, -8.2); tel.rotation.x = 0.18;
  tel.traverse(o => { if (o instanceof THREE.Mesh && o !== face) { o.receiveShadow = true; } });
  scene.add(tel);

  return { draw };
}
