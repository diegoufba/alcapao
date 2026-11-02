import type { GameEvent, GameState, PlayerId, PlayerState } from '../core/types';
import { zoneOf } from '../core/arena';
import { PUSH_COOLDOWN } from '../core/physics';
import type { DeviceSlots } from '../input/devices';
import type { DeviceId } from '../input/keyboard';
import { PLAYER_COLORS } from '../render/scene';

const DEVICE_LABELS: Record<string, string> = {
  'kb-wasd': 'WASD + F',
  'kb-arrows': 'Setas + Shift',
  'kb-ijkl': 'IJKL + O',
};

export function deviceLabel(d: DeviceId | null): string {
  if (!d) return '';
  if (d.startsWith('gp-')) return `Gamepad ${Number(d.slice(3)) + 1}`;
  return DEVICE_LABELS[d] ?? d;
}

interface Card {
  el: HTMLElement;
  status: HTMLElement;
  fill: HTMLElement;
  cool: HTMLElement;
  warn: HTMLElement;
  chip: HTMLElement;
  last: { status: string; width: string; cool: string; offline: boolean; out: boolean; fallen: boolean };
}

function el(tag: string, cls: string, text = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function statusOf(p: PlayerState, state: GameState, eliminatedAt: Map<PlayerId, number>): string {
  const survival = state.mode === 'survival';
  if (!p.inPlay) return survival ? `Eliminado (R${eliminatedAt.get(p.id) ?? state.round})` : 'Espectador';
  if (!survival) return `${p.score.toLocaleString('pt-BR')} pts`;
  if (state.phase === 'reveal') return p.fallen ? 'Caiu!' : 'Acertou';
  if (state.phase === 'question' || state.phase === 'lock') {
    const z = zoneOf(p.pos);
    return z ? `Em ${z}` : 'Na faixa';
  }
  return 'Na arena';
}

export function createHud(root: HTMLElement): {
  update(state: GameState, devices: DeviceSlots, events: GameEvent[]): void;
} {
  root.classList.add('hud');
  root.replaceChildren();
  const cards = new Map<PlayerId, Card>();
  const eliminatedAt = new Map<PlayerId, number>();

  function build(p: PlayerState, label: string): Card {
    const card = el('div', 'hud-card');
    card.style.setProperty('--pc', PLAYER_COLORS[p.id]);
    const head = el('div', 'hud-head');
    head.append(el('span', 'hud-dot'), el('span', 'hud-id', p.id), el('span', 'hud-device', label));
    const status = el('div', 'hud-status');
    const chip = el('span', 'hud-chip');
    const row = el('div', 'hud-statusrow');
    row.append(status, chip);
    const bar = el('div', 'hud-bar');
    const fill = el('div', 'hud-fill');
    bar.append(fill);
    const cool = el('div', 'hud-cool');
    const warn = el('div', 'hud-warn', 'Controle desconectado');
    card.append(head, row, bar, cool, warn);
    root.append(card);
    return { el: card, status, fill, cool, warn, chip, last: { status: '', width: '', cool: '', offline: false, out: false, fallen: false } };
  }

  return {
    update(state, devices, events) {
      for (const e of events) {
        if (e.type === 'revealed' && state.mode === 'survival') {
          for (const id of e.fallen) eliminatedAt.set(id, state.round);
        }
      }
      for (const p of state.players) {
        let c = cards.get(p.id);
        if (!c) {
          c = build(p, deviceLabel(devices.deviceOf(p.id)));
          cards.set(p.id, c);
        }
        const status = statusOf(p, state, eliminatedAt);
        if (status !== c.last.status) { c.status.textContent = status; c.last.status = status; }

        const ratio = Math.min(Math.max(1 - p.pushCooldown / PUSH_COOLDOWN, 0), 1);
        const width = `${Math.round(ratio * 100)}%`;
        if (width !== c.last.width) { c.fill.style.width = width; c.last.width = width; }
        const cool = p.pushCooldown > 0 ? 'recarga' : 'pronto';
        if (cool !== c.last.cool) {
          c.cool.textContent = cool; c.last.cool = cool;
          c.el.classList.toggle('is-ready', cool === 'pronto');
        }

        const offline = !devices.isConnected(p.id);
        if (offline !== c.last.offline) { c.el.classList.toggle('is-offline', offline); c.last.offline = offline; }
        const out = !p.inPlay;
        if (out !== c.last.out) { c.el.classList.toggle('is-out', out); c.last.out = out; }
        const fallen = p.fallen;
        if (fallen !== c.last.fallen) { c.el.classList.toggle('is-fallen', fallen); c.last.fallen = fallen; }
      }
      for (const e of events) {
        if (e.type !== 'revealed') continue;
        for (const [id, pts] of Object.entries(e.scored) as [PlayerId, number][]) {
          const c = cards.get(id);
          if (!c || !(pts > 0)) continue;
          c.chip.textContent = `+${pts}`;
          c.chip.classList.remove('is-flying');
          void c.chip.offsetWidth; // reinicia a animação CSS
          c.chip.classList.add('is-flying');
        }
      }
    },
  };
}
