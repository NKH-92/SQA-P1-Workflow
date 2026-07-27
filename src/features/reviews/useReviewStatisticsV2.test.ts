import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile, ReviewEvent, ReviewRequest } from '../../types'

const mocks = vi.hoisted(() => ({
  hasSupabaseConfig: false,
  fetchReviewStatisticsV2: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  get hasSupabaseConfig() {
    return mocks.hasSupabaseConfig
  },
}))
vi.mock('../../data', () => ({
  fetchReviewStatisticsV2: mocks.fetchReviewStatisticsV2,
}))

import { useReviewStatisticsV2 } from './useReviewStatisticsV2'

const requests: ReviewRequest[] = [
  {
    id: 'r1',
    requester_id: 'member-1',
    title: 'r1',
    description: '',
    due_date: null,
    status: 'pending',
    created_at: '2026-07-01T00:00:00.000Z',
  },
]
const events: ReviewEvent[] = [
  {
    id: 1,
    review_request_id: 'r1',
    actor_id: null,
    actor_name_snapshot: 'actor',
    event_type: 'submitted',
    from_status: null,
    to_status: 'pending',
    occurred_at: '2026-07-01T00:00:00.000Z',
    metadata: {},
    transaction_id: 1,
  },
]
const profiles: Profile[] = [
  {
    id: 'member-1',
    email: 'member-1@example.com',
    name: '파트원 1',
    role: 'member',
    is_active: true,
  },
]

describe('useReviewStatisticsV2', () => {
  beforeEach(() => {
    mocks.hasSupabaseConfig = false
    mocks.fetchReviewStatisticsV2.mockReset()
  })

  it('uses the local parity builder in preview mode and never calls the RPC', async () => {
    mocks.hasSupabaseConfig = false
    const { result } = renderHook(() => useReviewStatisticsV2({ reviewRequests: requests, reviewEvents: events }))

    const envelope = await result.current({ from: '2026-07-01', to: '2026-07-31' })

    expect(mocks.fetchReviewStatisticsV2).not.toHaveBeenCalled()
    expect(envelope.new_requests).toBe(1)
    expect(envelope.schema_version).toBe(2)
  })

  it('delegates to the remote RPC when a Supabase project is configured', async () => {
    mocks.hasSupabaseConfig = true
    const remoteEnvelope = { schema_version: 2 }
    mocks.fetchReviewStatisticsV2.mockResolvedValue(remoteEnvelope)
    const { result } = renderHook(() => useReviewStatisticsV2({ reviewRequests: requests, reviewEvents: events }))

    const envelope = await result.current({ from: '2026-07-01', to: '2026-07-31', requesterId: 'member-1' })

    expect(mocks.fetchReviewStatisticsV2).toHaveBeenCalledWith({
      from: '2026-07-01',
      to: '2026-07-31',
      requesterId: 'member-1',
    })
    expect(envelope).toBe(remoteEnvelope)
  })

  it('keeps the remote callback stable when the local AppData snapshot changes', () => {
    mocks.hasSupabaseConfig = true
    const { result, rerender } = renderHook(
      ({ data }) => useReviewStatisticsV2(data),
      {
        initialProps: {
          data: { reviewRequests: requests, reviewEvents: events, profiles, irrelevantVersion: 1 },
        },
      },
    )
    const firstCallback = result.current

    rerender({
      data: {
        reviewRequests: [...requests],
        reviewEvents: [...events],
        profiles: [...profiles],
        irrelevantVersion: 2,
      },
    })

    expect(result.current).toBe(firstCallback)
  })

  it('rebuilds preview statistics when review requests change', async () => {
    const hiddenRequest: ReviewRequest = {
      ...requests[0],
      id: 'r2',
      title: 'r2',
    }
    const hiddenEvent: ReviewEvent = {
      ...events[0],
      id: 2,
      review_request_id: 'r2',
      transaction_id: 2,
    }
    const { result, rerender } = renderHook(
      ({ reviewRequests }) => useReviewStatisticsV2({
        reviewRequests,
        reviewEvents: [...events, hiddenEvent],
        profiles,
      }),
      { initialProps: { reviewRequests: requests } },
    )
    const firstCallback = result.current

    rerender({ reviewRequests: [...requests, hiddenRequest] })
    const envelope = await result.current({ from: '2026-07-01', to: '2026-07-31' })

    expect(result.current).not.toBe(firstCallback)
    expect(envelope.new_requests).toBe(2)
  })

  it('rebuilds preview statistics when review events change', async () => {
    const approvalEvent: ReviewEvent = {
      ...events[0],
      id: 2,
      event_type: 'approved',
      from_status: 'pending',
      to_status: 'approved',
      transaction_id: 2,
    }
    const { result, rerender } = renderHook(
      ({ reviewEvents }) => useReviewStatisticsV2({ reviewRequests: requests, reviewEvents, profiles }),
      { initialProps: { reviewEvents: events } },
    )
    const firstCallback = result.current

    rerender({ reviewEvents: [...events, approvalEvent] })
    const envelope = await result.current({ from: '2026-07-01', to: '2026-07-31' })

    expect(result.current).not.toBe(firstCallback)
    expect(envelope.approvals).toBe(1)
  })

  it('rebuilds preview statistics when profiles change', async () => {
    const { result, rerender } = renderHook(
      ({ profiles }) => useReviewStatisticsV2({ reviewRequests: requests, reviewEvents: events, profiles }),
      { initialProps: { profiles } },
    )
    const firstCallback = result.current

    rerender({ profiles: [{ ...profiles[0], name: '이름 변경' }] })
    const envelope = await result.current({ from: '2026-07-01', to: '2026-07-31' })

    expect(result.current).not.toBe(firstCallback)
    expect(envelope.requester_breakdown[0]?.requester_name).toBe('이름 변경')
  })
})
