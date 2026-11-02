import type { GameEvent, GameState } from '../core/types'
import type { Screen } from '../ui/router'

export type Track = 'menu' | 'partida' | 'morte-subita'
export type SfxId =
  | 'roleta-clique' | 'roleta-para' | 'pergunta' | 'tick' | 'tick-final' | 'trava' | 'empurrao' | 'impacto'
  | 'empurrao-vazio' | 'colisao' | 'revelacao' | 'alcapao' | 'queda' | 'acerto' | 'pontos' | 'anulada'
  | 'ui-navegar' | 'ui-confirmar' | 'ui-voltar' | 'jogador-entrou' | 'jogador-saiu'
export type UiEvent = 'navegar' | 'confirmar' | 'voltar' | 'entrou' | 'saiu'
export type DuckKey = 'tick' | 'reveal' | 'pause'
export type AudioCommand =
  | { type: 'music'; track: Track; fade: number }
  | { type: 'stinger'; id: 'vitoria'; then: Track }
  | { type: 'sfx'; id: SfxId; bus: 'sfx' | 'ui' }
  | { type: 'duck'; key: DuckKey; db: number; seconds: number | null }
  | { type: 'unduck'; key: DuckKey }
  | { type: 'lowpass'; on: boolean }

export interface AudioContextInput {
  screen: Screen
  state: GameState | null
  events: GameEvent[]
  paused: boolean
  uiEvents: UiEvent[]
}

const UI_SFX: Record<UiEvent, SfxId> = {
  navegar: 'ui-navegar',
  confirmar: 'ui-confirmar',
  voltar: 'ui-voltar',
  entrou: 'jogador-entrou',
  saiu: 'jogador-saiu',
}

const CLICK_INTERVAL = 0.12
const CLICK_COUNT = 21 // t = 0 … 2,4 s
const SPIN_STOP_AT = 2.5
const EPS = 1e-9

export class AudioDirector {
  private track: Track | null = null
  private prevScreen: Screen | null = null
  private prevPaused = false
  private prevPhase: GameState['phase'] | null = null
  private prevPhaseTime = 0
  private tickDucked = false
  private spinTime = 0
  private nextClick = 0
  private spinStopped = false

  update(dt: number, ctx: AudioContextInput): AudioCommand[] {
    const out: AudioCommand[] = []
    const sfx = (id: SfxId, bus: 'sfx' | 'ui' = 'sfx') => out.push({ type: 'sfx', id, bus })

    this.music(ctx, out)

    if (ctx.paused !== this.prevPaused) {
      if (ctx.paused) {
        out.push({ type: 'duck', key: 'pause', db: -12, seconds: null }, { type: 'lowpass', on: true })
      } else {
        out.push({ type: 'unduck', key: 'pause' }, { type: 'lowpass', on: false })
      }
      this.prevPaused = ctx.paused
    }

    const state = ctx.screen === 'match' ? ctx.state : null
    this.question(state, out, sfx)
    this.spin(dt, state, ctx.paused, sfx)
    this.prevPhase = state ? state.phase : null

    for (const e of ctx.events) this.event(e, ctx.state, out, sfx)

    for (const u of new Set(ctx.uiEvents)) sfx(UI_SFX[u], 'ui')

    this.prevScreen = ctx.screen
    return out
  }

  private music(ctx: AudioContextInput, out: AudioCommand[]): void {
    if (ctx.screen === 'press-start') return
    if (ctx.screen === 'results') {
      if (this.prevScreen !== 'results') {
        out.push({ type: 'stinger', id: 'vitoria', then: 'menu' })
        this.track = 'menu'
      }
      return
    }
    const want: Track =
      ctx.screen === 'match' ? (ctx.state?.suddenDeath ? 'morte-subita' : 'partida') : 'menu'
    if (want !== this.track) {
      out.push({ type: 'music', track: want, fade: 1 })
      this.track = want
    }
  }

  private question(state: GameState | null, out: AudioCommand[], sfx: (id: SfxId) => void): void {
    if (!state || state.phase !== 'question') {
      if (this.tickDucked) {
        out.push({ type: 'unduck', key: 'tick' })
        this.tickDucked = false
      }
      return
    }
    const cur = state.phaseTime
    let prev = this.prevPhaseTime
    // nova pergunta (entrou na fase, ou o tempo voltou a subir): rearma
    if (this.prevPhase !== 'question' || cur > prev) {
      prev = cur
      if (this.tickDucked) {
        out.push({ type: 'unduck', key: 'tick' })
        this.tickDucked = false
      }
    }
    for (const n of [5, 4, 3, 2, 1]) {
      if (prev > n && cur <= n) sfx(n === 1 ? 'tick-final' : 'tick')
    }
    if (!this.tickDucked && cur <= 5) {
      out.push({ type: 'duck', key: 'tick', db: -6, seconds: null })
      this.tickDucked = true
    }
    this.prevPhaseTime = cur
  }

  private spin(dt: number, state: GameState | null, paused: boolean, sfx: (id: SfxId) => void): void {
    if (!state || state.phase !== 'spin') {
      if (this.prevPhase === 'spin' && state && !this.spinStopped) sfx('roleta-para')
      return
    }
    if (this.prevPhase !== 'spin') {
      this.spinTime = 0
      this.nextClick = 0
      this.spinStopped = false
    } else if (!paused) {
      this.spinTime += dt
    }
    while (this.nextClick < CLICK_COUNT && this.spinTime >= this.nextClick * CLICK_INTERVAL - EPS) {
      sfx('roleta-clique')
      this.nextClick++
    }
    if (!this.spinStopped && this.spinTime >= SPIN_STOP_AT - EPS) {
      sfx('roleta-para')
      this.spinStopped = true
    }
  }

  private event(e: GameEvent, state: GameState | null, out: AudioCommand[], sfx: (id: SfxId) => void): void {
    switch (e.type) {
      case 'questionShown':
        sfx('pergunta')
        break
      case 'phaseChanged':
        if (e.phase === 'lock') sfx('trava')
        break
      case 'pushed':
        if (e.targets.length > 0) {
          sfx('empurrao')
          sfx('impacto')
        } else sfx('empurrao-vazio')
        break
      case 'bumped':
        sfx('colisao')
        break
      case 'revealed': {
        sfx('revelacao')
        out.push({ type: 'duck', key: 'reveal', db: -10, seconds: 1.5 })
        if (!e.voided && e.fallen.length > 0) {
          sfx('alcapao')
          sfx('queda')
        }
        const scored = Object.keys(e.scored).length > 0
        const someoneRight =
          !e.voided &&
          (state?.mode === 'points'
            ? scored
            : state !== null && state.players.some((p) => p.inPlay && !e.fallen.includes(p.id)))
        if (someoneRight) sfx('acerto')
        if (scored) sfx('pontos')
        if (e.voided) sfx('anulada')
        break
      }
      default:
        break
    }
  }
}
