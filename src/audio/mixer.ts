import type { AudioCommand, DuckKey, SfxId, Track } from './director'
import { AUDIO_DEFAULTS, type AudioSettings } from './settings'

export const dbToGain = (db: number): number => 10 ** (db / 20)

/** Ganho de música combinado: produto dos ganhos (dB → linear) de todas as chaves de ducking ativas. */
export function combineDucks(ducks: ReadonlyMap<DuckKey, number>): number {
  let g = 1
  for (const db of ducks.values()) g *= dbToGain(db)
  return g
}

/** Controla as vozes simultâneas de um mesmo som: ao passar do limite, devolve a mais antiga para ser cortada. */
export class VoiceLimiter<T> {
  private voices: T[] = []
  constructor(private readonly max: number) {}

  add(v: T): T | undefined {
    this.voices.push(v)
    return this.voices.length > this.max ? this.voices.shift() : undefined
  }

  remove(v: T): void {
    const i = this.voices.indexOf(v)
    if (i >= 0) this.voices.splice(i, 1)
  }

  get count(): number { return this.voices.length }
}

export const MAX_VOICES = 4
export const LOWPASS_ON_HZ = 800
export const LOWPASS_OFF_HZ = 20000
const DUCK_RAMP = 0.15
const STINGER_FADE = 0.3

interface MusicPlay { track: Track; src: AudioBufferSourceNode; gain: GainNode }

export class Mixer {
  private readonly master: GainNode
  private readonly buses: Record<'music' | 'sfx' | 'ui', GainNode>
  private readonly duck: GainNode
  private readonly filter: BiquadFilterNode
  private settings: AudioSettings = { ...AUDIO_DEFAULTS }
  private readonly ducks = new Map<DuckKey, number>()
  private readonly duckTimers = new Map<DuckKey, ReturnType<typeof setTimeout>>()
  private current: MusicPlay | null = null
  private stinger: { src: AudioBufferSourceNode; gain: GainNode } | null = null
  private musicToken = 0
  private readonly voices = new Map<SfxId, VoiceLimiter<AudioBufferSourceNode>>()
  private readonly warned = new Set<string>()

  constructor(private readonly ctx: AudioContext, private readonly lib: Map<string, AudioBuffer>) {
    this.master = ctx.createGain()
    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = LOWPASS_OFF_HZ
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -12
    comp.ratio.value = 8
    this.master.connect(this.filter).connect(comp).connect(ctx.destination)
    this.buses = { music: ctx.createGain(), sfx: ctx.createGain(), ui: ctx.createGain() }
    this.duck = ctx.createGain()
    this.buses.music.connect(this.master)
    this.buses.sfx.connect(this.master)
    this.buses.ui.connect(this.master)
    this.duck.connect(this.buses.music)
    this.setSettings(this.settings)
  }

  setSettings(s: AudioSettings): void {
    this.settings = { ...s }
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.02)
    this.buses.music.gain.setTargetAtTime(s.music, t, 0.02)
    this.buses.sfx.gain.setTargetAtTime(s.sfx, t, 0.02)
    this.buses.ui.gain.setTargetAtTime(s.ui, t, 0.02)
  }

  apply(cmd: AudioCommand): void {
    switch (cmd.type) {
      case 'music': this.playMusic(cmd.track, cmd.fade, true); break
      case 'stinger': this.playStinger(cmd.id, cmd.then); break
      case 'sfx': this.playSfx(cmd.id, cmd.bus); break
      case 'duck': this.setDuck(cmd.key, cmd.db, cmd.seconds); break
      case 'unduck': this.clearDuck(cmd.key); break
      case 'lowpass':
        this.filter.frequency.setTargetAtTime(cmd.on ? LOWPASS_ON_HZ : LOWPASS_OFF_HZ, this.ctx.currentTime, 0.05)
        break
    }
  }

  private buffer(id: string): AudioBuffer | null {
    const b = this.lib.get(id)
    if (b) return b
    if (!this.warned.has(id)) {
      this.warned.add(id)
      console.warn(`[audio] sem buffer para "${id}"; ignorado`)
    }
    return null
  }

  // --- música ---------------------------------------------------------------
  private fadeOut(m: { src: AudioBufferSourceNode; gain: GainNode }, seconds: number): void {
    const t = this.ctx.currentTime
    m.gain.gain.cancelScheduledValues(t)
    m.gain.gain.setValueAtTime(m.gain.gain.value, t)
    m.gain.gain.linearRampToValueAtTime(0, t + seconds)
    m.src.stop(t + seconds + 0.05)
  }

  private playMusic(track: Track, fade: number, cancelStinger: boolean): void {
    if (this.current?.track === track && !this.stinger) return
    if (cancelStinger) {
      this.musicToken++
      if (this.stinger) { this.fadeOut(this.stinger, STINGER_FADE); this.stinger = null }
    }
    if (this.current) { this.fadeOut(this.current, fade); this.current = null }
    const buf = this.buffer(track)
    if (!buf) return
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const gain = this.ctx.createGain()
    const t = this.ctx.currentTime
    gain.gain.setValueAtTime(fade > 0 ? 0 : 1, t)
    if (fade > 0) gain.gain.linearRampToValueAtTime(1, t + fade)
    src.connect(gain).connect(this.duck)
    src.start(t)
    this.current = { track, src, gain }
  }

  private playStinger(id: 'vitoria', then: Track): void {
    this.musicToken++
    const token = this.musicToken
    if (this.current) { this.fadeOut(this.current, STINGER_FADE); this.current = null }
    const buf = this.buffer(id)
    if (!buf) { this.playMusic(then, 1, false); return }
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const gain = this.ctx.createGain()
    src.connect(gain).connect(this.duck)
    const handle = { src, gain }
    this.stinger = handle
    src.onended = () => {
      if (this.stinger === handle) this.stinger = null
      if (token === this.musicToken) this.playMusic(then, 1, false)
    }
    src.start(this.ctx.currentTime + STINGER_FADE * 0.5)
  }

  // --- ducking ---------------------------------------------------------------
  private applyDuck(): void {
    this.duck.gain.setTargetAtTime(combineDucks(this.ducks), this.ctx.currentTime, DUCK_RAMP / 3)
  }

  private setDuck(key: DuckKey, db: number, seconds: number | null): void {
    const timer = this.duckTimers.get(key)
    if (timer) clearTimeout(timer)
    this.duckTimers.delete(key)
    this.ducks.set(key, db)
    this.applyDuck()
    if (seconds !== null) this.duckTimers.set(key, setTimeout(() => { this.clearDuck(key) }, seconds * 1000))
  }

  private clearDuck(key: DuckKey): void {
    const timer = this.duckTimers.get(key)
    if (timer) clearTimeout(timer)
    this.duckTimers.delete(key)
    if (this.ducks.delete(key)) this.applyDuck()
  }

  // --- efeitos -----------------------------------------------------------------
  private playSfx(id: SfxId, bus: 'sfx' | 'ui'): void {
    const buf = this.buffer(id)
    if (!buf) return
    let lim = this.voices.get(id)
    if (!lim) { lim = new VoiceLimiter(MAX_VOICES); this.voices.set(id, lim) }
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = 0.95 + Math.random() * 0.1
    src.connect(this.buses[bus])
    src.onended = () => { lim.remove(src) }
    const old = lim.add(src)
    if (old) { old.onended = null; try { old.stop() } catch { /* já terminou */ } }
    src.start()
  }
}
