import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AppData } from '../../types'

const emptyResult: AppData & { optionalWarnings: string[]; snapshotAt: string | null } = {
    announcements: [],
    changeApplications: [],
    changeActionItems: [],
    productChangeTasks: [],
    changeProductScope: [],
    changeAssigneeOptions: [],
  profiles: [],
  allowedUsers: [],
  products: [],
  duties: [],
  dutyMajorCategories: [],
  productAssignments: [],
  dutyAssignments: [],
  reviewRequests: [],
  projects: [],
  projectAssignments: [],
  profileNotes: [],
  activityLogs: [],
  optionalWarnings: [],
  snapshotAt: null,
}

const { fetchAppDataMock, fetchReviewRequestByIdMock, fetchAnnouncementByIdMock } = vi.hoisted(() => ({
  fetchAppDataMock: vi.fn(),
  fetchReviewRequestByIdMock: vi.fn(),
  fetchAnnouncementByIdMock: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  isPreviewMode: false,
  supabase: {},
}))

vi.mock('../../data/fetchAppData', () => ({
  fetchAppData: fetchAppDataMock,
  fetchReviewRequestById: fetchReviewRequestByIdMock,
  fetchAnnouncementById: fetchAnnouncementByIdMock,
  mergeReviewRequests: (current: AppData['reviewRequests'], incoming: AppData['reviewRequests']) => [...current, ...incoming],
  mergeAnnouncements: (current: AppData['announcements'], incoming: AppData['announcements']) => [...current, ...incoming],
}))

import { useAppData } from './useAppData'

describe('useAppData session reset', () => {
  it('clears the previous session sync marker before a new login', async () => {
    fetchAppDataMock.mockResolvedValueOnce(emptyResult)
    const { result } = renderHook(() => useAppData())

    await act(async () => result.current.refreshData())
    expect(result.current.lastSyncedAt).toBeInstanceOf(Date)

    act(() => result.current.resetSyncState())
    expect(result.current.lastSyncedAt).toBeNull()
    expect(result.current.refreshing).toBe(false)
  })

  it('uses the server snapshot_at as lastSyncedAt evidence instead of the client wall clock', async () => {
    const serverSnapshotAt = '2026-07-20T01:23:45.000Z'
    fetchAppDataMock.mockResolvedValueOnce({ ...emptyResult, snapshotAt: serverSnapshotAt })
    const { result } = renderHook(() => useAppData())

    await act(async () => result.current.refreshData())

    expect(result.current.lastSyncedAt).toEqual(new Date(serverSnapshotAt))
  })

  it('falls back to the client clock when no bootstrap reported a snapshot_at', async () => {
    fetchAppDataMock.mockResolvedValueOnce({ ...emptyResult, snapshotAt: null })
    const { result } = renderHook(() => useAppData())

    await act(async () => result.current.refreshData())

    expect(result.current.lastSyncedAt).toBeInstanceOf(Date)
  })

  it('reports bootstrap overflow warnings through the user-visible warning callback', async () => {
    const warning = '[SQA_CHANGE_APPLICATIONS_TRUNCATED] 최신 1,000건만 불러왔습니다.'
    const reportWarnings = vi.fn()
    fetchAppDataMock.mockResolvedValueOnce({ ...emptyResult, optionalWarnings: [warning] })
    const { result } = renderHook(() => useAppData(reportWarnings))

    await act(async () => result.current.refreshData())

    expect(reportWarnings).toHaveBeenCalledWith([warning])
    expect(result.current.dataWarnings).toEqual([warning])
  })

  it('ignores a previous session refresh that resolves after reset', async () => {
    let resolveFetch!: (value: typeof emptyResult) => void
    fetchAppDataMock.mockImplementationOnce(
      () => new Promise<typeof emptyResult>((resolve) => { resolveFetch = resolve }),
    )
    const { result } = renderHook(() => useAppData())

    let pending!: Promise<void>
    act(() => { pending = result.current.refreshData() })
    act(() => result.current.resetSyncState())
    await act(async () => {
      resolveFetch({
        ...emptyResult,
        profiles: [{ id: 'old-user', email: 'old@example.com', name: 'Old', role: 'member' }],
      })
      await pending
    })

    expect(result.current.data.profiles).toEqual([])
    expect(result.current.lastSyncedAt).toBeNull()
  })

  it('loads an old deep-linked review without expanding the regular history query', async () => {
    const oldReview = {
      id: 'old-review',
      requester_id: 'member-1',
      title: 'Old review',
      description: 'Historical detail',
      due_date: null,
      status: 'approved' as const,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-02T00:00:00.000Z',
      profiles: null,
      review_feedback: [],
    }
    fetchReviewRequestByIdMock.mockResolvedValueOnce(oldReview)
    const { result } = renderHook(() => useAppData())

    let loaded: boolean | null = false
    await act(async () => { loaded = await result.current.loadReviewRequest('old-review') })

    expect(loaded).toBe(true)
    expect(result.current.data.reviewRequests).toContainEqual(oldReview)
    expect(fetchReviewRequestByIdMock).toHaveBeenCalledWith('old-review', undefined)
  })

  it('loads a deep-linked announcement outside the capped board query', async () => {
    const oldAnnouncement = {
      id: 'old-announcement',
      title: 'Old announcement',
      body: 'Historical detail',
      is_pinned: false,
      pinned_at: null,
      created_by: 'leader-1',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-02T00:00:00.000Z',
    }
    fetchAnnouncementByIdMock.mockResolvedValueOnce(oldAnnouncement)
    const { result } = renderHook(() => useAppData())

    let loaded: boolean | null = false
    await act(async () => { loaded = await result.current.loadAnnouncement('old-announcement') })

    expect(loaded).toBe(true)
    expect(result.current.data.announcements).toContainEqual(oldAnnouncement)
    expect(fetchAnnouncementByIdMock).toHaveBeenCalledWith('old-announcement', undefined)
  })
})

async function refreshAndCatch(refreshData: () => Promise<void>): Promise<unknown> {
  let caught: unknown
  await act(async () => {
    try {
      await refreshData()
    } catch (error) {
      caught = error
    }
  })
  return caught
}

describe('useAppData sync health', () => {
  it('records a failure in syncHealth and still rejects so callers can show their own toast', async () => {
    fetchAppDataMock.mockRejectedValueOnce(new Error('failed to fetch'))
    const { result } = renderHook(() => useAppData())

    const caught = await refreshAndCatch(result.current.refreshData)

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe('failed to fetch')
    expect(result.current.syncHealth.consecutiveFailures).toBe(1)
    expect(result.current.syncHealth.lastErrorCode).toBe('network')
    expect(result.current.syncHealth.stale).toBe(false)
  })

  it('resets syncHealth to healthy after a subsequent success', async () => {
    fetchAppDataMock.mockRejectedValueOnce(new Error('failed to fetch'))
    fetchAppDataMock.mockRejectedValueOnce(new Error('failed to fetch'))
    fetchAppDataMock.mockResolvedValueOnce(emptyResult)
    const { result } = renderHook(() => useAppData())

    await refreshAndCatch(result.current.refreshData)
    await refreshAndCatch(result.current.refreshData)
    expect(result.current.syncHealth.stale).toBe(true)

    await act(async () => result.current.refreshData())

    expect(result.current.syncHealth.consecutiveFailures).toBe(0)
    expect(result.current.syncHealth.stale).toBe(false)
    expect(result.current.syncHealth.lastErrorCode).toBeNull()
  })

  it('does not let a superseded (raced) failure corrupt the current generation health', async () => {
    let rejectFirst!: (error: Error) => void
    fetchAppDataMock.mockImplementationOnce(
      () => new Promise((_resolve, reject) => { rejectFirst = reject }),
    )
    fetchAppDataMock.mockResolvedValueOnce(emptyResult)
    const { result } = renderHook(() => useAppData())

    let firstRefresh!: Promise<void>
    act(() => { firstRefresh = result.current.refreshData() })
    await act(async () => { await result.current.refreshData() })

    expect(result.current.syncHealth.consecutiveFailures).toBe(0)
    expect(result.current.syncHealth.stale).toBe(false)

    await act(async () => {
      rejectFirst(new Error('stale generation network error'))
      await firstRefresh.catch(() => {})
    })

    // The superseded refresh's failure must not retroactively mark the current,
    // already-successful generation as unhealthy.
    expect(result.current.syncHealth.consecutiveFailures).toBe(0)
    expect(result.current.syncHealth.stale).toBe(false)
  })

  it('resets syncHealth to initial on resetSyncState (logout)', async () => {
    fetchAppDataMock.mockRejectedValueOnce(new Error('failed to fetch'))
    const { result } = renderHook(() => useAppData())

    await refreshAndCatch(result.current.refreshData)
    expect(result.current.syncHealth.consecutiveFailures).toBe(1)

    act(() => result.current.resetSyncState())

    expect(result.current.syncHealth.consecutiveFailures).toBe(0)
    expect(result.current.syncHealth.stale).toBe(false)
    expect(result.current.syncHealth.lastErrorCode).toBeNull()
  })
})
