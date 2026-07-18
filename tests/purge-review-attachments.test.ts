import { describe, expect, it, vi } from 'vitest'
import {
  CONFIRMATION,
  describeTarget,
  listAllObjects,
  parseOptions,
  removeInBatches,
  summarizeObjects,
} from '../scripts/purge-review-attachments.mjs'

describe('review attachment purge safety', () => {
  it('defaults to dry-run and rejects execute without the exact confirmation', () => {
    expect(parseOptions([])).toMatchObject({ execute: false, verbose: false, outputPath: null })
    expect(() => parseOptions(['--execute'])).toThrow(`--confirm=${CONFIRMATION}`)
    expect(parseOptions(['--execute', `--confirm=${CONFIRMATION}`, '--verbose', '--output=result.json']))
      .toMatchObject({ execute: true, confirmed: true, verbose: true, outputPath: 'result.json' })
  })

  it('shows only a safe project identifier for known and local targets', () => {
    expect(describeTarget('https://project-ref.supabase.co/path')).toEqual({
      url: 'https://project-ref.supabase.co',
      projectRef: 'project-ref',
    })
    expect(describeTarget('http://127.0.0.1:54321')).toEqual({
      url: 'http://127.0.0.1:54321',
      projectRef: 'local',
    })
  })

  it('paginates folders, deduplicates paths, totals bytes, and hides names behind a digest', async () => {
    const rootPage: Array<{
      id: string | null
      name: string
      metadata: { size: number | string } | null
    }> = Array.from({ length: 100 }, (_, index) => ({
      id: `root-${index}`,
      name: `file-${String(index).padStart(3, '0')}.pdf`,
      metadata: { size: 2 },
    }))
    rootPage[0] = { id: null, name: 'member-a', metadata: null }
    const list = vi.fn(async (prefix: string, { offset }: { offset: number }) => {
      if (prefix === '' && offset === 0) return { data: rootPage, error: null }
      if (prefix === '' && offset === 100) {
        return { data: [{ id: 'tail', name: 'tail.pdf', metadata: { size: '3' } }], error: null }
      }
      if (prefix === 'member-a' && offset === 0) {
        return { data: [{ id: 'nested', name: 'evidence.pdf', metadata: { size: 7 } }], error: null }
      }
      return { data: [], error: null }
    })

    const objects = await listAllObjects({ list })
    expect(objects).toHaveLength(101)
    expect(objects).toContainEqual({ name: 'member-a/evidence.pdf', size: 7 })
    expect(summarizeObjects(objects)).toMatchObject({ objectCount: 101, totalBytes: 208 })
    expect(summarizeObjects(objects).nameDigestSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(list).toHaveBeenCalledWith('', expect.objectContaining({ limit: 100, offset: 100 }))
  })

  it('deletes in bounded batches and reports every failed object count', async () => {
    const objects = Array.from({ length: 205 }, (_, index) => ({ name: `object-${index}`, size: 1 }))
    const remove = vi.fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'batch rejected' } })
      .mockResolvedValueOnce({ error: null })

    const failures = await removeInBatches({ remove }, objects)
    expect(remove).toHaveBeenCalledTimes(3)
    expect(remove.mock.calls.map(([batch]) => batch.length)).toEqual([100, 100, 5])
    expect(failures).toEqual([{
      batchNumber: 2,
      failedObjectCount: 100,
      errorCode: 'storage_remove_failed',
    }])
  })
})
