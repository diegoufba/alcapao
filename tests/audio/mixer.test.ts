import { test, expect, describe } from 'vitest'
import { dbToGain, combineDucks, VoiceLimiter } from '../../src/audio/mixer'
import type { DuckKey } from '../../src/audio/director'

describe('dbToGain', () => {
  test('0 dB é 1 e -20 dB é 0,1', () => {
    expect(dbToGain(0)).toBe(1)
    expect(dbToGain(-20)).toBeCloseTo(0.1, 6)
  })
  test('-6 dB ≈ 0,501', () => { expect(dbToGain(-6)).toBeCloseTo(0.501, 3) })
})

describe('combineDucks', () => {
  test('sem chaves é 1', () => { expect(combineDucks(new Map())).toBe(1) })
  test('combina de forma multiplicativa (dB somam)', () => {
    const m = new Map<DuckKey, number>([['tick', -6], ['pause', -12]])
    expect(combineDucks(m)).toBeCloseTo(dbToGain(-18), 6)
  })
})

describe('VoiceLimiter', () => {
  test('até o limite não corta ninguém', () => {
    const l = new VoiceLimiter<number>(4)
    for (let i = 0; i < 4; i++) expect(l.add(i)).toBeUndefined()
    expect(l.count).toBe(4)
  })
  test('a 5ª voz corta a mais antiga', () => {
    const l = new VoiceLimiter<number>(4)
    for (let i = 0; i < 4; i++) l.add(i)
    expect(l.add(4)).toBe(0)
    expect(l.add(5)).toBe(1)
    expect(l.count).toBe(4)
  })
  test('remove libera espaço', () => {
    const l = new VoiceLimiter<number>(2)
    l.add(1); l.add(2); l.remove(1)
    expect(l.add(3)).toBeUndefined()
  })
})
