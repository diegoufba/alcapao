import { AUDIO_KEY, readJson, writeJson, type StorageLike } from '../storage'

export interface AudioSettings {
  master: number
  music: number
  sfx: number
  ui: number
  muted: boolean
}

export const AUDIO_DEFAULTS: AudioSettings = { master: 0.8, music: 0.6, sfx: 1, ui: 0.8, muted: false }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function level(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.min(1, Math.max(0, v))
}

export function loadAudioSettings(s: StorageLike): AudioSettings {
  const raw = readJson<Record<string, unknown>>(s, AUDIO_KEY, {}, isRecord)
  return {
    master: level(raw.master, AUDIO_DEFAULTS.master),
    music: level(raw.music, AUDIO_DEFAULTS.music),
    sfx: level(raw.sfx, AUDIO_DEFAULTS.sfx),
    ui: level(raw.ui, AUDIO_DEFAULTS.ui),
    muted: typeof raw.muted === 'boolean' ? raw.muted : AUDIO_DEFAULTS.muted,
  }
}

export function saveAudioSettings(s: StorageLike, v: AudioSettings): void {
  writeJson(s, AUDIO_KEY, v)
}
