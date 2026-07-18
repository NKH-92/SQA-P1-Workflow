import { describe, expect, it, vi } from 'vitest'
import { fetchAllPages } from './pagination'

describe('fetchAllPages', () => {
  it('does not truncate a 1001-row dataset at the PostgREST default limit', async () => {
    const source = Array.from({ length: 1001 }, (_, id) => ({ id }))
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: source.slice(from, to + 1),
      error: null,
    }))

    const result = await fetchAllPages(fetchPage)

    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(1001)
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 999)
    expect(fetchPage).toHaveBeenNthCalledWith(2, 1000, 1999)
  })

  it('stops and preserves the first page error', async () => {
    const error = new Error('page failed')
    const result = await fetchAllPages(async () => ({ data: null, error }))
    expect(result).toEqual({ data: null, error })
  })
})
