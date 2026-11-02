import { button, fmt, h, portrait, stage, type ScreenCtl } from './dom';
import type { Nav } from './nav';
import { getRecord, submitRecord, type RecordKey } from '../records';
import type { StorageLike } from '../storage';
import type { MatchResult } from '../match';
import type { PlayerId, RankEntry } from '../core/types';
import { PLAYER_COLORS } from '../render/scene';

interface ResultsDeps { nav: Nav; storage: StorageLike; onAgain(): void; onMenu(): void }

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** Vencedor da morte súbita: 1º com a mesma pontuação do 2º (o desempate vem do ranking, não dos pontos). */
function wonSuddenDeath(ranking: RankEntry[]): boolean {
  const [a, b] = ranking;
  return !!a && !!b && a.pos === 1 && b.pos === 2 && a.score !== undefined && a.score === b.score;
}

/** Quem empatou no topo com o vencedor da morte súbita (mesma pontuação, fora o 1º). */
export function tiedWith(ranking: RankEntry[]): PlayerId[] {
  const [first, ...rest] = ranking;
  return rest.filter((r) => r.score === first?.score).map((r) => r.id);
}

/** "P2", "P2 e P3", "P2, P3 e P4". */
export function listIds(ids: string[]): string {
  return ids.length <= 1 ? (ids[0] ?? '') : `${ids.slice(0, -1).join(', ')} e ${ids[ids.length - 1]}`;
}

function rowInfo(r: RankEntry, mode: MatchResult['mode'], sd: boolean): string {
  if (mode === 'survival') return r.eliminatedRound === undefined ? 'Sobreviveu' : `Caiu na rodada ${r.eliminatedRound}`;
  const base = `${fmt(r.score ?? 0)} pts`;
  return sd && r.pos === 1 ? `${base} · venceu a morte súbita` : base;
}

function subtitle(res: MatchResult, sd: boolean): string {
  const [first] = res.ranking;
  if (res.mode === 'survival') {
    const last = Math.max(0, ...res.ranking.map((r) => r.eliminatedRound ?? 0));
    return `Último de pé após ${last} ${plural(last, 'rodada', 'rodadas')}`;
  }
  const n = res.rounds ?? 0;
  if (sd) return `Empate com ${listIds(tiedWith(res.ranking))} em ${n} rodadas, decidido na morte súbita`;
  return first ? `${n} rodadas` : '';
}

function multi(res: MatchResult): HTMLElement[] {
  const winners = res.ranking.filter((r) => r.pos === 1);
  const sd = wonSuddenDeath(res.ranking);
  const tie = winners.length > 1;
  const lead = winners[0]?.id ?? 'P1';
  const title = h('h1', 'result-title', tie ? 'EMPATE!' : `${lead} VENCEU!`);
  title.style.color = tie ? 'var(--accent)' : PLAYER_COLORS[lead];
  const sub = tie ? `${listIds(winners.map((w) => w.id))} dividem o 1º lugar` : subtitle(res, sd);
  const head = h('div', 'result-head', '',
    portrait(lead === 'P1' && !tie ? 'P1win' : lead, 'result-char', tie ? '' : `${lead} comemorando`),
    h('span', 'result-sub', sub), title);
  const list = h('ol', 'ranking', '', ...res.ranking.map((r) => {
    const dot = h('span', 'dot');
    dot.style.background = PLAYER_COLORS[r.id as PlayerId];
    return h('li', '', '', h('span', 'pos', `${r.pos}º`), dot, h('span', 'rid', r.id), h('div', 'grow'), h('span', 'info', rowInfo(r, res.mode, sd)));
  }));
  return [head, list];
}

export function createResults({ nav, storage, onAgain, onMenu }: ResultsDeps): ScreenCtl {
  const body = h('div', 'results-body');
  const again = button('btn btn-accent', 'JOGAR DE NOVO', onAgain);
  again.dataset.autofocus = '';
  const { el, stage: st } = stage('results', body, h('div', 'foot', '', again, button('btn btn-alt', 'Menu', onMenu)));

  function solo(res: MatchResult): HTMLElement[] {
    const mine = res.ranking[0];
    let key: RecordKey;
    let value: number;
    let title: string;
    let sub: string;
    let unit: string;
    if (res.mode === 'survival') {
      key = 'survival';
      value = res.roundsSurvived ?? 0;
      title = `${value} ${plural(value, 'RODADA', 'RODADAS')}`;
      sub = mine?.eliminatedRound === undefined ? 'Você sobreviveu a todas as perguntas' : `Você caiu na rodada ${mine.eliminatedRound}`;
      unit = ' rodadas';
    } else {
      key = `points-${res.rounds ?? 12}` as RecordKey;
      value = mine?.score ?? 0;
      title = `${fmt(value)} ${plural(value, 'PONTO', 'PONTOS')}`;
      sub = `${res.rounds ?? 12} rodadas`;
      unit = ' pts';
    }
    const isNew = submitRecord(storage, key, value);
    const rec = getRecord(storage, key);
    return [
      h('div', 'result-head', '', h('span', 'result-sub', sub), h('h1', 'result-title', title), isNew ? h('span', 'badge-new', 'Novo recorde!') : ''),
      h('div', 'stat', '', h('span', 'stat-label', 'Recorde'), h('span', 'stat-value', rec > 0 ? `${fmt(rec)}${unit}` : '—')),
    ];
  }

  return {
    el,
    show(params) {
      const res = params as MatchResult;
      body.replaceChildren(...(res.players === 1 ? solo(res) : multi(res)));
      el.hidden = false;
      nav.setActive(st, { onBack: onMenu });
    },
    hide() { el.hidden = true; },
  };
}
