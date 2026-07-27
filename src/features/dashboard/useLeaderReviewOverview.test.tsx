import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, ReviewEvent, ReviewRequest } from '../../types'

const mocks = vi.hoisted(() => ({
  fetchReviewStatisticsV2: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
}))
vi.mock('../../data', () => ({
  fetchReviewStatisticsV2: mocks.fetchReviewStatisticsV2,
}))

import { useLeaderReviewOverview } from './useLeaderReviewOverview'

const request: ReviewRequest = {
  id: 'review-1',
  requester_id: 'member-1',
  title: 'Review 1',
  description: '',
  due_date: null,
  status: 'pending',
  review_round: 1,
  created_at: '2026-07-01T00:00:00.000Z',
}

const submittedEvent: ReviewEvent = {
  id: 1,
  review_request_id: request.id,
  actor_id: 'member-1',
  actor_name_snapshot: 'Member 1',
  event_type: 'submitted',
  from_status: null,
  to_status: 'pending',
  occurred_at: '2026-07-01T00:00:00.000Z',
  metadata: {},
  transaction_id: 1,
}

function appData(overrides: Partial<AppData> = {}): AppData {
  return {
    announcements: [],
    changeApplications: [],
    changeActionItems: [],
    productChangeTasks: [],
    changeProductScope: [],
    changeAssigneeOptions: [],
    profiles: [],
    allowedUsers: [],
    products: [],
    dutyMajorCategories: [],
    duties: [],
    productAssignments: [],
    dutyAssignments: [],
    reviewRequests: [request],
    reviewEvents: [submittedEvent],
    projects: [],
    projectAssignments: [],
    profileNotes: [],
    activityLogs: [],
    ...overrides,
  }
}

function envelope() {
  return {
    schema_version: 2 as const,
    timezone: 'Asia/Seoul' as const,
    generated_at: '2026-07-15T03:00:00.000Z',
    from: '2026-07-01',
    to: '2026-07-15',
    requester_id: null,
    status: null,
    new_requests: 1,
    resubmissions: 0,
    approvals: 0,
    rejections: 0,
    pending_count: 1,
    requester_breakdown: [],
    month_end_backlog: [],
    monthly_breakdown: [],
  }
}

describe('useLeaderReviewOverview', () => {
  beforeEach(() => {
    mocks.fetchReviewStatisticsV2.mockReset()
    mocks.fetchReviewStatisticsV2.mockResolvedValue(envelope())
  })

  it('does not refetch for an equivalent or unrelated AppData refresh', async () => {
    const initialData = appData()
    const { rerender } = renderHook(({ data }) => useLeaderReviewOverview(data), {
      initialProps: { data: initialData },
    })

    await waitFor(() => expect(mocks.fetchReviewStatisticsV2).toHaveBeenCalledTimes(1))

    rerender({
      data: appData({
        announcements: [{
          id: 'announcement-1',
          title: 'Unrelated',
          body: 'No review statistics change',
          is_pinned: false,
          pinned_at: null,
          created_by: 'leader-1',
          created_at: '2026-07-15T03:00:00.000Z',
          updated_at: '2026-07-15T03:00:00.000Z',
        }],
        reviewRequests: initialData.reviewRequests.map((item) => ({ ...item })),
        reviewEvents: initialData.reviewEvents?.map((item) => ({ ...item })),
      }),
    })

    await waitFor(() => expect(mocks.fetchReviewStatisticsV2).toHaveBeenCalledTimes(1))
  })

  it('refetches when a review request status changes', async () => {
    const { rerender } = renderHook(({ data }) => useLeaderReviewOverview(data), {
      initialProps: { data: appData() },
    })
    await waitFor(() => expect(mocks.fetchReviewStatisticsV2).toHaveBeenCalledTimes(1))

    rerender({
      data: appData({ reviewRequests: [{ ...request, status: 'approved' }] }),
    })

    await waitFor(() => expect(mocks.fetchReviewStatisticsV2).toHaveBeenCalledTimes(2))
  })

  it('refetches when a review event is added', async () => {
    const { rerender } = renderHook(({ data }) => useLeaderReviewOverview(data), {
      initialProps: { data: appData() },
    })
    await waitFor(() => expect(mocks.fetchReviewStatisticsV2).toHaveBeenCalledTimes(1))

    rerender({
      data: appData({
        reviewEvents: [
          submittedEvent,
          {
            ...submittedEvent,
            id: 2,
            event_type: 'approved',
            from_status: 'pending',
            to_status: 'approved',
            occurred_at: '2026-07-15T03:00:00.000Z',
            transaction_id: 2,
          },
        ],
      }),
    })

    await waitFor(() => expect(mocks.fetchReviewStatisticsV2).toHaveBeenCalledTimes(2))
  })

  it('ignores an older response after a review change starts a new request', async () => {
    let resolveFirst: ((value: ReturnType<typeof envelope>) => void) | undefined
    let resolveSecond: ((value: ReturnType<typeof envelope>) => void) | undefined
    mocks.fetchReviewStatisticsV2
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))
    const { result, rerender } = renderHook(({ data }) => useLeaderReviewOverview(data), {
      initialProps: { data: appData() },
    })
    await waitFor(() => expect(mocks.fetchReviewStatisticsV2).toHaveBeenCalledTimes(1))

    rerender({
      data: appData({ reviewRequests: [{ ...request, status: 'approved' }] }),
    })
    await waitFor(() => expect(mocks.fetchReviewStatisticsV2).toHaveBeenCalledTimes(2))

    const newest = { ...envelope(), approvals: 1, pending_count: 0 }
    await act(async () => resolveSecond?.(newest))
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', envelope: newest }))

    await act(async () => resolveFirst?.({ ...envelope(), approvals: 0, pending_count: 1 }))
    expect(result.current).toEqual({ status: 'ready', envelope: newest })
  })
})
