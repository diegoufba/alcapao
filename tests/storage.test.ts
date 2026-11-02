import { test, expect, describe, afterEach, vi } from 'vitest'
import { safeStorage, readJson, writeJson, type StorageLike } from '../src/storage'
import { getRecord, submitRecord } from '../src/records'

function memory(): StorageLike {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
}

const throwing: StorageLike = {
  getItem() {
    throw new Error('blocked')
  },
  setItem() {
    throw new Error('blocked')
  },
}

const isNumber = (v: unknown): v is number => typeof v === 'number'

describe('safeStorage', () => {
  test('sem window (node) devolve um armazenamento em memória funcional', () => {
    const s = safeStorage()
    expect(s.getItem('x')).toBeNull()
    s.setItem('x', '1')
    expect(s.getItem('x')).toBe('1')
  })
})

describe('safeStorage com localStorage que falha ao gravar', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('valor gravado no fallback é o que getItem devolve depois', () => {
    let failWrites = false
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          if (failWrites) throw new Error('quota')
          store.set(k, v)
        },
        removeItem: (k: string) => void store.delete(k),
      },
    })
    const s = safeStorage()
    s.setItem('k', 'antigo')
    failWrites = true
    s.setItem('k', 'v')
    expect(s.getItem('k')).toBe('v')
  })
})

describe('readJson / writeJson', () => {
  test('armazenamento que lança: readJson devolve o fallback e writeJson não lança', () => {
    expect(readJson(throwing, 'k', 7, isNumber)).toBe(7)
    expect(() => writeJson(throwing, 'k', 1)).not.toThrow()
  })

  test('JSON corrompido devolve o fallback', () => {
    const s = memory()
    s.setItem('k', '{')
    expect(readJson(s, 'k', 7, isNumber)).toBe(7)
  })

  test('valor que não passa na validação devolve o fallback', () => {
    const s = memory()
    writeJson(s, 'k', 'texto')
    expect(readJson(s, 'k', 7, isNumber)).toBe(7)
  })

  test('ida e volta', () => {
    const s = memory()
    writeJson(s, 'k', 42)
    expect(readJson(s, 'k', 7, isNumber)).toBe(42)
  })
})

describe('records', () => {
  test('sem registro, o recorde é 0', () => {
    expect(getRecord(memory(), 'survival')).toBe(0)
  })

  test('submitRecord só grava quando o valor é maior', () => {
    const s = memory()
    expect(submitRecord(s, 'survival', 10)).toBe(true)
    expect(submitRecord(s, 'survival', 10)).toBe(false)
    expect(submitRecord(s, 'survival', 5)).toBe(false)
    expect(getRecord(s, 'survival')).toBe(10)
    expect(submitRecord(s, 'survival', 11)).toBe(true)
    expect(getRecord(s, 'survival')).toBe(11)
  })

  test('as chaves 8, 12 e 16 são independentes', () => {
    const s = memory()
    submitRecord(s, 'points-8', 800)
    submitRecord(s, 'points-12', 1200)
    expect(getRecord(s, 'points-8')).toBe(800)
    expect(getRecord(s, 'points-12')).toBe(1200)
    expect(getRecord(s, 'points-16')).toBe(0)
    expect(getRecord(s, 'survival')).toBe(0)
  })

  test('valor não finito é rejeitado sem apagar os recordes', () => {
    const s = memory()
    submitRecord(s, 'survival', 5)
    expect(submitRecord(s, 'points-8', Infinity)).toBe(false)
    expect(submitRecord(s, 'points-8', NaN)).toBe(false)
    expect(getRecord(s, 'survival')).toBe(5)
  })

  test('dados corrompidos ou inválidos são ignorados', () => {
    const s = memory()
    s.setItem('alcapao.records.v1', '{"survival":-3,"points-8":"x"}')
    expect(getRecord(s, 'survival')).toBe(0)
    expect(submitRecord(s, 'survival', 4)).toBe(true)
  })

  test('armazenamento que lança não quebra', () => {
    expect(getRecord(throwing, 'survival')).toBe(0)
    expect(() => submitRecord(throwing, 'survival', 3)).not.toThrow()
  })
})
