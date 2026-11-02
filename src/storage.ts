export interface StorageLike {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}

export const RECORDS_KEY = 'alcapao.records.v1'
export const AUDIO_KEY = 'alcapao.audio.v1'

function probeLocalStorage(): Storage | null {
  try {
    const ls = window.localStorage
    const probe = '__alcapao.probe__'
    ls.setItem(probe, '1')
    ls.removeItem(probe)
    return ls
  } catch {
    return null
  }
}

export function safeStorage(): StorageLike {
  const real = probeLocalStorage()
  const memory = new Map<string, string>()
  return {
    getItem(k) {
      if (real) {
        try {
          return real.getItem(k)
        } catch {
          // cai para a memória
        }
      }
      return memory.get(k) ?? null
    },
    setItem(k, v) {
      if (real) {
        try {
          real.setItem(k, v)
          return
        } catch {
          // cai para a memória
        }
      }
      memory.set(k, v)
    },
  }
}

export function readJson<T>(
  s: StorageLike,
  key: string,
  fallback: T,
  isValid: (v: unknown) => v is T,
): T {
  try {
    const raw = s.getItem(key)
    if (raw === null) return fallback
    const parsed: unknown = JSON.parse(raw)
    return isValid(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

export function writeJson(s: StorageLike, key: string, v: unknown): void {
  try {
    s.setItem(key, JSON.stringify(v))
  } catch {
    // nunca lança
  }
}
