import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AppData } from '../../types'

const emptyResult: AppData & { optionalWarnings: string[] } = {
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
}

const { fetchAppDataMock, fetchReviewRequestByIdMock } = vi.hoisted(() => ({
  fetchAppDataMock: vi.fn(),
  fetchReviewRequestByIdMock: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  isPreviewMode: false,
  supabase: {},
}))

vi.mock('../../data/fetchAppData', () => ({
  fetchAppData: fetchAppDataMock,
  fetchReviewRequestById: fetchReviewRequestByIdMock,
  mergeReviewRequests: (current: AppData['reviewRequests'], incoming: AppData['reviewRequests']) => [...current, ...incoming],
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
      attachment_url: null,
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
})
