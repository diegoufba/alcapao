import { test, expect, describe } from 'vitest';
import { createSnapshotBuffer } from '../../src/net/snapshots';
import type { GameEvent, GameState, Phase } from '../../src/core/types';

/** Estado de exemplo: só P1 se move em x. */
function estado(x: number): GameState {
  const base = { vel: { x: 0, z: 0 }, facing: 0, inPlay: true, fallen: false, score: 0, pushCooldown: 0, frozen: 0, knockTime: 0, knockVel: { x: 0, z: 0 } };
  return {
    mode: 'survival', phase: 'question', phaseTime: 0, round: 1, totalRounds: null,
    players: [{ id: 'P1', pos: { x, z: 0 }, ...base }, { id: 'P2', pos: { x: 3, z: 3 }, ...base }],
    theme: null, question: null, suddenDeath: null,
  };
}

const ev = (phase: Phase): GameEvent => ({ type: 'phaseChanged', phase });

describe('snapshots', () => {
  test('null antes do primeiro snapshot', () => {
    const b = createSnapshotBuffer();
    expect(b.advance(1 / 60)).toBeNull();
    expect(b.age()).toBe(Infinity);
  });

  test('interpola no meio', () => {
    const b = createSnapshotBuffer({ delayTicks: 0 });
    b.pushSnap(0, estado(0));
    b.pushSnap(2, estado(1));
    const f = b.advance(1 / 60)!;
    expect(f.positions.get('P1')!.x).toBeCloseTo(0.5);
    expect(f.state.players[0].pos.x).toBeCloseTo(0.5);
  });

  test('sem o seguinte fica no último', () => {
    const b = createSnapshotBuffer({ delayTicks: 0 });
    b.pushSnap(0, estado(0));
    b.pushSnap(2, estado(1));
    b.advance(1 / 60);
    b.advance(1 / 60);
    const f = b.advance(1 / 60)!;
    expect(f.positions.get('P1')!.x).toBe(1);
    const g = b.advance(1 / 60)!;
    expect(g.positions.get('P1')!.x).toBe(1);
  });

  test('não altera os snapshots guardados', () => {
    const b = createSnapshotBuffer({ delayTicks: 0 });
    const s0 = estado(0);
    b.pushSnap(0, s0);
    b.pushSnap(2, estado(1));
    const f = b.advance(1 / 60)!;
    expect(f.state).not.toBe(s0);
    expect(s0.players[0].pos.x).toBe(0);
  });

  test('fora de ordem é descartado', () => {
    const b = createSnapshotBuffer({ delayTicks: 0 });
    b.pushSnap(4, estado(4));
    b.pushSnap(2, estado(2));
    const f = b.advance(1 / 60)!;
    expect(f.positions.get('P1')!.x).toBe(4);
  });

  test('salto > 2 m não interpola', () => {
    const b = createSnapshotBuffer({ delayTicks: 0 });
    b.pushSnap(0, estado(0));
    b.pushSnap(2, estado(5));
    const f = b.advance(1 / 60)!;
    expect(f.positions.get('P1')!.x).toBe(5);
  });

  test('antes do primeiro snapshot guardado usa o primeiro, sem B', () => {
    const b = createSnapshotBuffer(); // atraso 6
    b.pushSnap(10, estado(2));
    b.pushSnap(12, estado(3));
    const f = b.advance(1 / 60)!;
    expect(f.positions.get('P1')!.x).toBe(2);
  });

  test('eventos saem pelo tick, uma única vez', () => {
    const b = createSnapshotBuffer({ delayTicks: 6 });
    for (let t = 0; t <= 30; t += 2) b.pushSnap(t, estado(0));
    b.pushEvents(10, [ev('lock')]);
    const saidas: number[] = [];
    // cada quadro avança 1 tick: render = quadro - 6
    for (let quadro = 1; quadro <= 20; quadro++) {
      const f = b.advance(1 / 60)!;
      saidas.push(f.events.length);
      if (quadro - 6 < 10) expect(f.events).toEqual([]);
    }
    expect(saidas.reduce((a, c) => a + c, 0)).toBe(1);
    expect(saidas[10 + 6 - 1]).toBe(1); // sai no quadro em que render = 10
  });

  test('eventos saem em ordem de tick e, no mesmo tick, de chegada', () => {
    const b = createSnapshotBuffer({ delayTicks: 0 });
    b.pushSnap(0, estado(0));
    b.pushEvents(2, [ev('reveal')]);
    b.pushEvents(1, [ev('lock'), ev('question')]);
    b.pushEvents(2, [ev('reset')]);
    expect(b.advance(2 / 60)!.events.map((e) => (e as { phase: string }).phase)).toEqual(['lock', 'question', 'reveal', 'reset']);
  });

  test('evento atrasado (tick já passado) sai no próximo advance', () => {
    const b = createSnapshotBuffer({ delayTicks: 0 });
    b.pushSnap(0, estado(0));
    b.pushSnap(20, estado(0));
    b.advance(10 / 60);
    b.pushEvents(3, [ev('lock')]);
    expect(b.advance(1 / 60)!.events).toHaveLength(1);
  });

  test('themes: vazio antes de haver, depois os mais recentes até A', () => {
    const b = createSnapshotBuffer({ delayTicks: 0 });
    b.pushSnap(0, estado(0));
    expect(b.advance(0)!.themes).toEqual([]);
    b.pushSnap(2, estado(0), ['X', 'Y']);
    b.pushSnap(4, estado(0));
    expect(b.advance(1 / 60)!.themes).toEqual([]); // render=1, A=0
    expect(b.advance(1 / 60)!.themes).toEqual(['X', 'Y']); // A=2
    expect(b.advance(2 / 60)!.themes).toEqual(['X', 'Y']); // A=4 herda
  });

  test('age conta pelo advance desde o último snapshot', () => {
    const b = createSnapshotBuffer();
    b.pushSnap(0, estado(0));
    b.advance(0.25);
    b.advance(0.25);
    expect(b.age()).toBeCloseTo(0.5);
    b.pushSnap(2, estado(0));
    expect(b.age()).toBe(0);
  });

  test('aba volta do segundo plano: pula para o presente e libera eventos de uma vez', () => {
    const b = createSnapshotBuffer(); // atraso 6
    for (let t = 0; t <= 600; t += 2) b.pushSnap(t, estado(t / 1000));
    b.pushEvents(100, [ev('lock')]);
    b.pushEvents(594, [ev('reveal')]);
    // sem nenhum advance antes, o relógio está no 1º snapshot (0); advance(10) = 600 ticks
    const f = b.advance(10)!;
    expect(f.state.players[0].pos.x).toBeCloseTo(594 / 1000); // render = 594
    expect(f.events.map((e) => (e as { phase: string }).phase)).toEqual(['lock', 'reveal']);
    expect(b.advance(1 / 60)!.events).toEqual([]);
  });

  test('relógio atrasado (host travou): pula para o presente e libera os eventos antigos uma vez', () => {
    const b = createSnapshotBuffer(); // atraso 6
    b.pushSnap(0, estado(0));
    b.advance(1 / 60);
    b.advance(1 / 60); // relógio parado perto do início
    for (let t = 2; t <= 100; t += 2) b.pushSnap(t, estado(t / 1000));
    b.pushEvents(10, [ev('lock')]);
    b.pushEvents(94, [ev('reveal')]);
    const f = b.advance(1 / 60)!; // newest - clock > 30: relógio vai para 100
    expect(f.state.players[0].pos.x).toBeCloseTo(94 / 1000); // render = 100 - 6
    expect(f.events.map((e) => (e as { phase: string }).phase)).toEqual(['lock', 'reveal']);
    expect(b.advance(1 / 60)!.events).toEqual([]);
  });

  test('relógio adiantado (clock > newest + 6): volta para o mais novo', () => {
    const b = createSnapshotBuffer(); // atraso 6
    for (let t = 0; t <= 600; t += 2) b.pushSnap(t, estado(t / 1000));
    b.pushEvents(594, [ev('reveal')]);
    b.pushEvents(700, [ev('reset')]);
    const f = b.advance(20)!; // relógio iria a 1200
    expect(f.state.players[0].pos.x).toBeCloseTo(594 / 1000); // render = 594, não 1194
    expect(f.events.map((e) => (e as { phase: string }).phase)).toEqual(['reveal']);
  });
});
