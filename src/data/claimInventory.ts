import type { Claim } from './types'

export interface ClaimEntry { path: string; owner: string | null; claim: Claim }
export function claimInventory(value: unknown): ClaimEntry[] {
  const rows: ClaimEntry[] = []
  function walk(v: unknown, path = '', owner: string | null = null) {
    if (!v || typeof v !== 'object') return
    if ('id' in v && typeof v.id === 'string') owner = v.id
    if ('value' in v && 'sourceId' in v && 'evidence' in v) {
      rows.push({path, owner, claim: v as Claim}); return
    }
    for (const [key, child] of Object.entries(v)) walk(child, path ? `${path}.${key}` : key, owner)
  }
  walk(value)
  return rows
}
export const claimKey = (r: ClaimEntry) => `${r.owner}:${r.path.replace(/^[^.]+\.\d+\./, '')}`
