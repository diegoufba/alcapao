import { StickTracker, STICK_RADIUS } from '../input/stick';
import type { TouchInput } from '../input/touch';

export interface TouchControls {
  el: HTMLElement;
  /** A cada quadro, com a camada visível: desenha base/pino do analógico e o anel de recarga. */
  update(): void;
  /** Solta o dedo do analógico e zera o `TouchInput` (blur, aba oculta, saída da partida). */
  reset(): void;
}

/**
 * Controles na tela para o modo toque: analógico flutuante na metade esquerda, EMPURRAR à direita
 * e o botão de pausa. Cada dedo é tratado pelo seu `pointerId`, com captura do ponteiro.
 */
export function createTouchControls(deps: {
  touch: TouchInput;
  onPause(): void;
  /** recarga 0..1 do jogador local (para o anel), ou null sem partida */
  cooldown(): number | null;
}): TouchControls {
  const { touch } = deps;
  const tracker = new StickTracker();
  let stickId: number | null = null;
  const knob = { x: 0, y: 0 }; // último ponto do dedo do analógico

  const el = document.createElement('div');
  el.className = 'touch-controls';

  const zone = document.createElement('div');
  zone.className = 'tc-stick-zone';
  const base = document.createElement('div');
  base.className = 'tc-stick-base';
  const pin = document.createElement('div');
  pin.className = 'tc-stick-pin';
  base.append(pin);
  zone.append(base);

  const push = document.createElement('button');
  push.type = 'button';
  push.className = 'tc-push';
  push.textContent = 'EMPURRAR';

  const pause = document.createElement('button');
  pause.type = 'button';
  pause.className = 'tc-pause';
  pause.setAttribute('aria-label', 'Pausar');
  pause.textContent = '‖';

  el.append(zone, push, pause);

  function syncStick(): void { touch.setStick(tracker.vector()); }
  function release(id: number): void {
    tracker.up(id);
    if (id === stickId) stickId = null;
    syncStick();
  }

  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (stickId !== null) return; // outro dedo já está no analógico
    stickId = e.pointerId;
    tracker.down(e.pointerId, e.clientX, e.clientY);
    knob.x = e.clientX; knob.y = e.clientY;
    try { zone.setPointerCapture(e.pointerId); } catch { /* ponteiro sintético ou já solto */ }
    syncStick();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    tracker.move(e.pointerId, e.clientX, e.clientY);
    knob.x = e.clientX; knob.y = e.clientY;
    syncStick();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    zone.addEventListener(type, (e) => release(e.pointerId));
  }

  push.addEventListener('pointerdown', (e) => { e.preventDefault(); touch.pressPush(); });
  // pointerdown já pausou; o click só cobre ativação sem ponteiro (leitor de tela)
  pause.addEventListener('pointerdown', (e) => { e.preventDefault(); deps.onPause(); });
  pause.addEventListener('click', () => deps.onPause());
  el.addEventListener('contextmenu', (e) => e.preventDefault()); // toque longo não abre menu

  return {
    el,
    update() {
      const o = tracker.origin();
      base.classList.toggle('is-on', o !== null);
      if (o) {
        base.style.transform = `translate(${o.x}px, ${o.y}px)`;
        const dx = knob.x - o.x;
        const dy = knob.y - o.y;
        const d = Math.hypot(dx, dy);
        const k = d > STICK_RADIUS ? STICK_RADIUS / d : 1; // o pino para na borda da base
        pin.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      }
      const c = deps.cooldown();
      const ready = c === null ? 1 : 1 - Math.min(1, Math.max(0, c));
      push.style.setProperty('--ready', `${Math.round(ready * 360)}deg`);
      push.classList.toggle('is-cooling', ready < 1);
    },
    reset() {
      if (stickId !== null) release(stickId);
      touch.reset();
    },
  };
}
