import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReviewEvent, ReviewRequest } from '../../types'

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
})
