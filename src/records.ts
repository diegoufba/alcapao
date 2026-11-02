import { RECORDS_KEY, readJson, writeJson, type StorageLike } from './storage'

export type RecordKey = 'survival' | 'points-8' | 'points-12' | 'points-16'

type Records = Partial<Record<RecordKey, number>>

function isRecords(v: unknown): v is Records {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  return Object.values(v).every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)
}

export function getRecord(s: StorageLike, k: RecordKey): number {
  return readJson<Records>(s, RECORDS_KEY, {}, isRecords)[k] ?? 0
}

export function submitRecord(s: StorageLike, k: RecordKey, value: number): boolean {
  if (!Number.isFinite(value) || value < 0 || !(value > getRecord(s, k))) return false
  const all = readJson<Records>(s, RECORDS_KEY, {}, isRecords)
  writeJson(s, RECORDS_KEY, { ...all, [k]: value })
  return true
}
