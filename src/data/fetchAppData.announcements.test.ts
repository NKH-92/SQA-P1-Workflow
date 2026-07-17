import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Announcement } from '../types'

const mocks = vi.hoisted(() => {
  const results: Record<string, { data: unknown[] | null; error: unknown }> = {}
  const queries: Record<string, {
    select: ReturnType<typeof vi.fn>
    order: ReturnType<typeof vi.fn>
    or: ReturnType<typeof vi.fn>
    limit: ReturnType<typeof vi.fn>
  }> = {}
  const from = vi.fn((table: string) => {
    const query = {
      select: vi.fn(),
      order: vi.fn(),
      or: vi.fn(),
      limit: vi.fn(),
      then: (
        resolve: (value: { data: unknown[] | null; error: unknown }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(results[table] ?? { data: [], error: null }).then(resolve, reject),
    }
    query.select.mockReturnValue(query)
    query.order.mockReturnValue(query)
    query.or.mockReturnValue(query)
    query.limit.mockReturnValue(query)
    queries[table] = query
    return query
  })
  return { results, queries, from }
})

vi.mock('../lib/supabase', () => ({
  supabase: { from: mocks.from },
}))

import { fetchAppData } from './fetchAppData'

const announcement: Announcement = {
  id: 'announcement-1',
  title: 'Pinned',
  body: 'Body',
  is_pinned: true,
  pinned_at: '2026-07-16T01:00:00.000Z',
  created_by: 'leader-1',
  created_at: '2026-07-16T00:00:00.000Z',
  updated_at: '2026-07-16T01:00:00.000Z',
}

describe('fetchAppData announcements', () => {
  beforeEach(() => {
    mocks.from.mockClear()
    Object.keys(mocks.results).forEach((key) => delete mocks.results[key])
    Object.keys(mocks.queries).forEach((key) => delete mocks.queries[key])
  })

  it('loads up to 200 announcements in board order', async () => {
    mocks.results.announcements = { data: [announcement], error: null }

    const result = await fetchAppData()

    expect(result.announcements).toEqual([announcement])
    expect(mocks.queries.announcements?.order.mock.calls).toEqual([
      ['is_pinned', { ascending: false }],
      ['pinned_at', { ascending: false, nullsFirst: false }],
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
    expect(mocks.queries.announcements?.limit).toHaveBeenCalledWith(200)
  })

  it('treats announcement query failure as an optional warning', async () => {
    mocks.results.announcements = { data: null, error: { message: 'announcements unavailable' } }

    const result = await fetchAppData()

    expect(result.announcements).toEqual([])
    expect(result.optionalWarnings).toHaveLength(1)
  })
})
