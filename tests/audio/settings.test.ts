import { test, expect, describe } from 'vitest'
import { AUDIO_DEFAULTS, loadAudioSettings, saveAudioSettings } from '../../src/audio/settings'
import { AUDIO_KEY, type StorageLike } from '../../src/storage'

function memory(): StorageLike {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
}

describe('audio settings', () => {
  test('vazio devolve o padrão', () => {
    expect(loadAudioSettings(memory())).toEqual(AUDIO_DEFAULTS)
  })

  test('storage que lança devolve o padrão', () => {
    const throwing: StorageLike = {
      getItem() {
        throw new Error('blocked')
      },
      setItem() {
        throw new Error('blocked')
      },
    }
    expect(loadAudioSettings(throwing)).toEqual(AUDIO_DEFAULTS)
    expect(() => saveAudioSettings(throwing, AUDIO_DEFAULTS)).not.toThrow()
  })

  test('JSON corrompido ou de tipo errado devolve o padrão', () => {
    const s = memory()
    s.setItem(AUDIO_KEY, '{nope')
    expect(loadAudioSettings(s)).toEqual(AUDIO_DEFAULTS)
    s.setItem(AUDIO_KEY, '[1,2]')
    expect(loadAudioSettings(s)).toEqual(AUDIO_DEFAULTS)
    s.setItem(AUDIO_KEY, 'null')
    expect(loadAudioSettings(s)).toEqual(AUDIO_DEFAULTS)
  })

  test('mescla com o padrão e limita a [0, 1]', () => {
    const s = memory()
    s.setItem(AUDIO_KEY, JSON.stringify({ music: 3 }))
    expect(loadAudioSettings(s)).toEqual({ ...AUDIO_DEFAULTS, music: 1 })
    s.setItem(AUDIO_KEY, JSON.stringify({ master: -2, sfx: 'x', muted: 'sim', ui: 0.25 }))
    expect(loadAudioSettings(s)).toEqual({ ...AUDIO_DEFAULTS, master: 0, ui: 0.25 })
  })

  test('salvar e carregar ida e volta', () => {
    const s = memory()
    const v = { master: 0.1, music: 0.2, sfx: 0.3, ui: 0.4, muted: true }
    saveAudioSettings(s, v)
    expect(loadAudioSettings(s)).toEqual(v)
  })
})
