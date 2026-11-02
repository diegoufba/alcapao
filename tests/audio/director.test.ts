import { test, expect, describe } from 'vitest'
import { AudioDirector, type AudioCommand, type AudioContextInput } from '../../src/audio/director'
import type { GameEvent, GameState, PlayerId, PlayerState, Phase } from '../../src/core/types'

const DT = 1 / 60

function player(id: PlayerId, over: Partial<PlayerState> = {}): PlayerState {
  return {
    id, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, facing: 0, inPlay: true, fallen: false,
    score: 0, pushCooldown: 0, frozen: 0, knockTime: 0, knockVel: { x: 0, z: 0 }, ...over,
  }
}

function makeState(over: Partial<GameState> = {}): GameState {
  return {
    mode: 'survival', phase: 'question', phaseTime: 10, round: 1, totalRounds: null,
    players: [player('P1'), player('P2')], theme: null, question: null, suddenDeath: null, ...over,
  }
}

function ctx(over: Partial<AudioContextInput> = {}): AudioContextInput {
  return { screen: 'match', state: makeState(), events: [], paused: false, uiEvents: [], ...over }
}

const sfxIds = (cmds: AudioCommand[]) => cmds.flatMap((c) => (c.type === 'sfx' ? [c.id] : []))
const ofType = <T extends AudioCommand['type']>(cmds: AudioCommand[], t: T) =>
  cmds.filter((c): c is Extract<AudioCommand, { type: T }> => c.type === t)

describe('música', () => {
  test('menu para match emite uma única troca e frames seguintes não repetem', () => {
    const d = new AudioDirector()
    expect(ofType(d.update(DT, ctx({ screen: 'menu', state: null })), 'music')).toEqual([
      { type: 'music', track: 'menu', fade: 1 },
    ])
    expect(d.update(DT, ctx({ screen: 'menu', state: null }))).toEqual([])
    const all: AudioCommand[] = []
    for (let i = 0; i < 5; i++) all.push(...d.update(DT, ctx({ state: makeState({ phase: 'spin' }) })))
    expect(ofType(all, 'music')).toEqual([{ type: 'music', track: 'partida', fade: 1 }])
  })

  test('press-start não toca música', () => {
    const d = new AudioDirector()
    expect(d.update(DT, ctx({ screen: 'press-start', state: null }))).toEqual([])
  })

  test('suddenDeath troca para morte-subita', () => {
    const d = new AudioDirector()
    d.update(DT, ctx())
    const out = d.update(DT, ctx({ state: makeState({ suddenDeath: ['P1', 'P2'] }) }))
    expect(ofType(out, 'music')).toEqual([{ type: 'music', track: 'morte-subita', fade: 1 }])
  })

  test('results emite stinger uma vez, sem music extra, e voltar ao menu não emite nada', () => {
    const d = new AudioDirector()
    d.update(DT, ctx())
    const out = d.update(DT, ctx({ screen: 'results', state: null }))
    expect(out).toEqual([{ type: 'stinger', id: 'vitoria', then: 'menu' }])
    expect(d.update(DT, ctx({ screen: 'results', state: null }))).toEqual([])
    expect(d.update(DT, ctx({ screen: 'menu', state: null }))).toEqual([])
  })

  test('pausado mantém a faixa', () => {
    const d = new AudioDirector()
    d.update(DT, ctx())
    const out = d.update(DT, ctx({ paused: true }))
    expect(ofType(out, 'music')).toEqual([])
  })
})

describe('tique', () => {
  test('de 6 s a 0: 4 tick, 1 tick-final, um duck e unduck + trava ao ir para lock', () => {
    const d = new AudioDirector()
    const all: AudioCommand[] = []
    let t = 6
    d.update(DT, ctx({ state: makeState({ phaseTime: t }) }))
    while (t > 0) {
      t = Math.max(0, t - DT)
      all.push(...d.update(DT, ctx({ state: makeState({ phaseTime: t }) })))
    }
    const ids = sfxIds(all)
    expect(ids.filter((i) => i === 'tick')).toHaveLength(4)
    expect(ids.filter((i) => i === 'tick-final')).toHaveLength(1)
    expect(ids.indexOf('tick-final')).toBeGreaterThan(ids.lastIndexOf('tick'))
    expect(ofType(all, 'duck')).toEqual([{ type: 'duck', key: 'tick', db: -6, seconds: null }])
    expect(ofType(all, 'unduck')).toEqual([])
    const out = d.update(DT, ctx({
      state: makeState({ phase: 'lock', phaseTime: 1 }),
      events: [{ type: 'phaseChanged', phase: 'lock' }],
    }))
    expect(ofType(out, 'unduck')).toEqual([{ type: 'unduck', key: 'tick' }])
    expect(sfxIds(out)).toEqual(['trava'])
  })

  test('nova pergunta rearma o tique', () => {
    const d = new AudioDirector()
    const run = () => {
      const all: AudioCommand[] = []
      let t = 6
      d.update(DT, ctx({ state: makeState({ phaseTime: t }) }))
      while (t > 0) {
        t = Math.max(0, t - DT)
        all.push(...d.update(DT, ctx({ state: makeState({ phaseTime: t }) })))
      }
      return all
    }
    const first = run()
    for (const phase of ['lock', 'reveal', 'reset', 'spin'] as Phase[]) {
      d.update(DT, ctx({ state: makeState({ phase, phaseTime: 1 }) }))
    }
    const second = run()
    expect(sfxIds(second).filter((i) => i === 'tick')).toHaveLength(4)
    expect(ofType(second, 'duck')).toHaveLength(1)
    expect(ofType(first, 'duck')).toHaveLength(1)
  })
})

describe('revelação', () => {
  const base = (): AudioDirector => {
    const d = new AudioDirector()
    d.update(DT, ctx({ state: makeState({ phase: 'reveal' }) }))
    return d
  }

  test('fallen gera revelacao, alcapao, queda, acerto e duck reveal', () => {
    const d = base()
    const ev: GameEvent = { type: 'revealed', correct: 'A', fallen: ['P2'], voided: false, scored: {} }
    const out = d.update(DT, ctx({ state: makeState({ phase: 'reveal', players: [player('P1'), player('P2', { fallen: true })] }), events: [ev] }))
    expect(sfxIds(out)).toEqual(['revelacao', 'alcapao', 'queda', 'acerto'])
    expect(ofType(out, 'duck')).toEqual([{ type: 'duck', key: 'reveal', db: -10, seconds: 1.5 }])
  })

  test('voided gera anulada, sem alcapao nem acerto', () => {
    const d = base()
    const ev: GameEvent = { type: 'revealed', correct: 'A', fallen: [], voided: true, scored: {} }
    const out = d.update(DT, ctx({ state: makeState({ phase: 'reveal' }), events: [ev] }))
    expect(sfxIds(out)).toEqual(['revelacao', 'anulada'])
  })

  test('modo pontos: scored gera acerto e pontos', () => {
    const d = base()
    const ev: GameEvent = { type: 'revealed', correct: 'A', fallen: [], voided: false, scored: { P1: 100 } }
    const out = d.update(DT, ctx({ state: makeState({ mode: 'points', phase: 'reveal' }), events: [ev] }))
    expect(sfxIds(out)).toEqual(['revelacao', 'acerto', 'pontos'])
  })

  test('modo pontos sem ninguém pontuando não gera acerto', () => {
    const d = base()
    const ev: GameEvent = { type: 'revealed', correct: 'A', fallen: [], voided: false, scored: {} }
    const out = d.update(DT, ctx({ state: makeState({ mode: 'points', phase: 'reveal' }), events: [ev] }))
    expect(sfxIds(out)).toEqual(['revelacao'])
  })
})

describe('movimento e eventos', () => {
  test('pushed sem alvos gera só empurrao-vazio', () => {
    const d = new AudioDirector()
    d.update(DT, ctx())
    const out = d.update(DT, ctx({ events: [{ type: 'pushed', by: 'P1', targets: [] }] }))
    expect(sfxIds(out)).toEqual(['empurrao-vazio'])
  })

  test('pushed com alvos, bumped e questionShown', () => {
    const d = new AudioDirector()
    d.update(DT, ctx())
    const out = d.update(DT, ctx({
      events: [
        { type: 'pushed', by: 'P1', targets: ['P2'] },
        { type: 'bumped', a: 'P1', b: 'P2' },
        { type: 'phaseChanged', phase: 'reveal' },
      ],
    }))
    expect(sfxIds(out)).toEqual(['empurrao', 'impacto', 'colisao'])
    const q = d.update(DT, ctx({ events: [{ type: 'questionShown', question: {} as never }] }))
    expect(sfxIds(q)).toEqual(['pergunta'])
  })
})

describe('pausa', () => {
  test('pausar e despausar', () => {
    const d = new AudioDirector()
    d.update(DT, ctx())
    expect(d.update(DT, ctx({ paused: true }))).toEqual([
      { type: 'duck', key: 'pause', db: -12, seconds: null },
      { type: 'lowpass', on: true },
    ])
    expect(d.update(DT, ctx({ paused: true }))).toEqual([])
    expect(d.update(DT, ctx({ paused: false }))).toEqual([
      { type: 'unduck', key: 'pause' },
      { type: 'lowpass', on: false },
    ])
  })
})

describe('roleta', () => {
  test('spin de 3 s: 21 cliques e uma parada', () => {
    const d = new AudioDirector()
    const all: AudioCommand[] = []
    for (let i = 0; i <= 180; i++) all.push(...d.update(DT, ctx({ state: makeState({ phase: 'spin', phaseTime: 3 - i * DT }) })))
    const ids = sfxIds(all)
    expect(ids.filter((i) => i === 'roleta-clique')).toHaveLength(21)
    expect(ids.filter((i) => i === 'roleta-para')).toHaveLength(1)
    expect(ids.lastIndexOf('roleta-clique')).toBeLessThan(ids.indexOf('roleta-para'))
  })

  test('sair do spin antes de 2,5 s emite roleta-para uma vez', () => {
    const d = new AudioDirector()
    const all: AudioCommand[] = []
    for (let i = 0; i < 60; i++) all.push(...d.update(DT, ctx({ state: makeState({ phase: 'spin' }) })))
    all.push(...d.update(DT, ctx({ state: makeState({ phase: 'question' }) })))
    all.push(...d.update(DT, ctx({ state: makeState({ phase: 'question' }) })))
    expect(sfxIds(all).filter((i) => i === 'roleta-para')).toHaveLength(1)
  })

  test('pausa congela a roleta', () => {
    const d = new AudioDirector()
    d.update(DT, ctx({ state: makeState({ phase: 'spin' }) }))
    let n = 0
    for (let i = 0; i < 120; i++) n += sfxIds(d.update(DT, ctx({ paused: true, state: makeState({ phase: 'spin' }) }))).length
    expect(n).toBe(0)
  })
})

describe('interface', () => {
  test('uiEvents viram sfx no canal ui, sem duplicar no mesmo update', () => {
    const d = new AudioDirector()
    d.update(DT, ctx({ screen: 'menu', state: null }))
    const out = d.update(DT, ctx({ screen: 'menu', state: null, uiEvents: ['confirmar', 'confirmar', 'navegar', 'entrou', 'saiu', 'voltar'] }))
    expect(out).toEqual([
      { type: 'sfx', id: 'ui-confirmar', bus: 'ui' },
      { type: 'sfx', id: 'ui-navegar', bus: 'ui' },
      { type: 'sfx', id: 'jogador-entrou', bus: 'ui' },
      { type: 'sfx', id: 'jogador-saiu', bus: 'ui' },
      { type: 'sfx', id: 'ui-voltar', bus: 'ui' },
    ])
  })
})
