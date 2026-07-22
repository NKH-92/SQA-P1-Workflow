import { describe, expect, it, vi } from 'vitest'
import { createEmptyAppData } from './appData'

vi.mock('../lib/supabase', () => ({ supabase: null }))

import { fetchAppData } from './fetchAppData'

/**
 * Local preview envelope parity. With no Supabase project configured
 * (`supabase === null`, e.g. local/offline preview mode), fetchAppData()
 * must never attempt a bootstrap RPC and must still return an object shaped
 * exactly like a real assembled+snapshotted result — empty AppData fields,
 * no optional warnings, and an explicit `snapshotAt: null` (there is no
 * server clock to attribute the data to) — so every downstream consumer
 * (useAppData) can treat the "no backend" and "real empty snapshot" cases
 * with the same shape.
 */
describe('fetchAppData local preview parity (no Supabase project)', () => {
  it('returns an empty, warning-free envelope with snapshotAt null without calling any query', async () => {
    const result = await fetchAppData()

    expect(result).toEqual({
      ...createEmptyAppData(),
      optionalWarnings: [],
      snapshotAt: null,
    })
  })
})
