import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { loadWeeklyMenu, publishWeeklyMenu } from './weeklyMenuRepository'

const storage = vi.hoisted(() => ({ list: vi.fn(), upload: vi.fn(), download: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ isPreviewMode: false, supabase: { storage: { from: () => storage } } }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-03T03:00:00Z'))
  storage.upload.mockResolvedValue({ error: null })
})
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks() })

describe('weekly menu storage', () => {
  it('replaces the same object across weeks and formats without accumulating paths', async () => {
    const png = new File(['one'], 'capture.png', { type: 'image/png' })
    await publishWeeklyMenu('2026-09-28', png)
    vi.setSystemTime(new Date('2026-10-05T03:00:00Z'))
    const jpg = new File(['two'], 'capture.jpg', { type: 'image/jpeg' })
    await publishWeeklyMenu('2026-10-05', jpg)
    expect(storage.upload.mock.calls).toEqual([
      ['current-menu', png, { contentType: 'image/png', cacheControl: '0', upsert: true }],
      ['current-menu', jpg, { contentType: 'image/jpeg', cacheControl: '0', upsert: true }],
    ])
  })
  it('uses server update time for the week and bypasses stale image caches', async () => {
    storage.list.mockResolvedValue({ data: [{ name: 'current-menu', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-10-03T00:00:00Z' }], error: null })
    storage.download.mockResolvedValue({ data: new Blob(['latest']), error: null })
    expect(await loadWeeklyMenu('2026-09-28')).not.toBeNull()
    expect(storage.download).toHaveBeenCalledWith('current-menu', { cacheNonce: '2026-10-03T00:00:00Z' }, { cache: 'no-store' })
    storage.download.mockClear()
    expect(await loadWeeklyMenu('2026-10-05')).toBeNull()
    expect(storage.download).not.toHaveBeenCalled()
  })
  it('does not report failed publication as success or upload a stale week', async () => {
    storage.upload.mockResolvedValue({ error: new Error('network') })
    const file = new File(['png'], 'menu.png', { type: 'image/png' })
    await expect(publishWeeklyMenu('2026-09-28', file)).rejects.toThrow('올리지 못했어요')
    await expect(publishWeeklyMenu('2026-09-21', file)).rejects.toThrow('새로운 주')
    expect(storage.upload).toHaveBeenCalledTimes(1)
  })
})
