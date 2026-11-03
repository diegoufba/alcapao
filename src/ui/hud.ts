import type { GameEvent, GameState, PlayerId, PlayerState } from '../core/types';
import { zoneOf } from '../core/arena';
import { PUSH_COOLDOWN } from '../core/physics';
import type { HudSlots } from '../input/match-input';
import type { DeviceId } from '../input/keyboard';
import { PLAYER_COLORS, ZONE_STYLE } from '../render/scene';

const DEVICE_LABELS: Record<string, string> = {
  'kb-wasd': 'WASD + F',
  'kb-arrows': 'Setas + Shift',
  'kb-ijkl': 'IJKL + O',
  touch: 'Toque',
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
  label: HTMLElement;
  last: { status: string; color: string; width: string; label: string; dim: boolean };
}

const RED = '#C8283A', GREEN = '#1B7F3E', TEXT = '#1E1A2E';

function el(tag: string, cls: string, text = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

const fmt = (n: number): string => n.toLocaleString('pt-BR');

/** Texto, cor e esmaecimento do status (§5 / mockup). */
function statusOf(
  p: PlayerState, state: GameState, eliminatedAt: Map<PlayerId, number>, gain: Map<PlayerId, number>, offline: boolean, voided: boolean,
): { text: string; color: string; dim: boolean } {
  const survival = state.mode === 'survival';
  const rev = state.phase === 'reveal';
  if (!p.inPlay) {
    return { text: survival ? `Eliminado (R${eliminatedAt.get(p.id) ?? state.round})` : 'Espectador', color: TEXT, dim: true };
  }
  if (offline) return { text: 'Controle desconectado', color: RED, dim: false };
  if (survival) {
    if (rev) {
      if (voided) return { text: 'Anulada', color: TEXT, dim: false };
      return p.fallen ? { text: 'Caiu!', color: RED, dim: true } : { text: 'Acertou', color: GREEN, dim: false };
    }
    if (state.phase === 'question' || state.phase === 'lock') {
      const z = zoneOf(p.pos);
      return { text: z ? `No ${ZONE_STYLE[z].name}` : 'Na faixa', color: TEXT, dim: false };
    }
    return { text: 'Na arena', color: TEXT, dim: false };
  }
  if (!rev) return { text: `${fmt(p.score)} pts`, color: TEXT, dim: false };
  const g = gain.get(p.id) ?? 0;
  if (p.fallen) return { text: `${fmt(p.score)} · caiu`, color: RED, dim: false };
  if (g > 0) return { text: `${fmt(p.score)} (+${g})`, color: GREEN, dim: false };
  return { text: `${fmt(p.score)} pts`, color: TEXT, dim: false };
}

export function createHud(root: HTMLElement): {
  update(state: GameState, slots: HudSlots, events: GameEvent[]): void;
} {
  root.classList.add('hud');
  root.replaceChildren();
  const cards = new Map<PlayerId, Card>();
  const eliminatedAt = new Map<PlayerId, number>();
  const gain = new Map<PlayerId, number>();
  let voided = false;

  function build(p: PlayerState, label: string): Card {
    const card = el('div', 'hud-card');
    card.style.setProperty('--pc', PLAYER_COLORS[p.id]);
    const head = el('div', 'hud-head');
    const status = el('span', 'hud-status');
    head.append(el('span', 'hud-dot'), el('span', 'hud-id', p.id), el('span', 'hud-device', label), el('div', 'hud-spacer'), status);
    const row = el('div', 'hud-row');
    const track = el('div', 'hud-track');
    const fill = el('div', 'hud-fill');
    track.append(fill);
    const lbl = el('span', 'hud-cool');
    row.append(el('span', 'hud-pushlabel', 'Empurrão'), track, lbl);
    card.append(head, row);
    root.append(card);
    return { el: card, status, fill, label: lbl, last: { status: '', color: '', width: '', label: '', dim: false } };
  }

  return {
    update(state, slots, events) {
      for (const e of events) {
        if (e.type !== 'revealed') continue;
        voided = e.voided;
        if (state.mode === 'survival') for (const id of e.fallen) eliminatedAt.set(id, state.round);
        gain.clear();
        for (const [id, pts] of Object.entries(e.scored) as [PlayerId, number][]) if (pts > 0) gain.set(id, pts);
      }
      for (const p of state.players) {
        let c = cards.get(p.id);
        if (!c) {
          c = build(p, slots.label(p.id));
          cards.set(p.id, c);
        }
        const st = statusOf(p, state, eliminatedAt, gain, !slots.isConnected(p.id), voided);
        if (st.text !== c.last.status) { c.status.textContent = st.text; c.last.status = st.text; }
        if (st.color !== c.last.color) { c.status.style.color = st.color; c.last.color = st.color; }
        if (st.dim !== c.last.dim) { c.el.classList.toggle('is-dim', st.dim); c.last.dim = st.dim; }

        const ratio = p.inPlay ? Math.min(Math.max(1 - p.pushCooldown / PUSH_COOLDOWN, 0), 1) : 0;
        const width = `${Math.round(ratio * 100)}%`;
        if (width !== c.last.width) { c.fill.style.width = width; c.last.width = width; }
        const label = !p.inPlay ? '—' : p.pushCooldown > 0 ? 'recarga' : 'pronto';
        if (label !== c.last.label) { c.label.textContent = label; c.last.label = label; }
      }
    },
  };
}
