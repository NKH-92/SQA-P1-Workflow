import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null })),
}))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { rpc: mocks.rpc },
}))

import {
  fetchReviewEventsPage,
  fetchReviewQueries,
  fetchReviewStatisticsV2,
} from './reviewQueries'

function validStatisticsEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 2,
    timezone: 'Asia/Seoul',
    generated_at: '2026-07-20T00:00:00.000Z',
    from: '2026-07-01',
    to: '2026-07-31',
    requester_id: null,
    status: null,
    new_requests: 0,
    resubmissions: 0,
    approvals: 0,
    rejections: 0,
    pending_count: 0,
    requester_breakdown: [],
    month_end_backlog: [],
    monthly_breakdown: [],
    ...overrides,
  }
}

describe('fetchReviewQueries bootstrap RPC adoption', () => {
  beforeEach(() => mocks.rpc.mockReset())

  it('calls get_review_bootstrap_v2 exactly once and fans the envelope out into the legacy three-query shape', async () => {
    const requests = [{ id: 'r1' }]
    const events = [{ id: '1' }]
    const receipts = [{ user_id: 'u1' }]
    mocks.rpc.mockResolvedValue({
      data: { schema_version: 2, snapshot_at: '2026-07-20T00:00:00.000Z', requests, events, read_receipts: receipts, unread_count: 1 },
      error: null,
    })

    const result = await fetchReviewQueries(mocks as unknown as NonNullable<Parameters<typeof fetchReviewQueries>[0]>)

    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('get_review_bootstrap_v2')
    expect(result.reviewRequestsResult).toEqual({ data: requests, error: null })
    expect(result.reviewEventsResult).toEqual({ data: events, error: null })
    expect(result.reviewReadReceiptsResult).toEqual({ data: receipts, error: null })
  })

  it('propagates the RPC error to all three legacy result slots instead of throwing', async () => {
    const rpcError = { message: 'bootstrap unavailable' }
    mocks.rpc.mockResolvedValue({ data: null, error: rpcError })

    const result = await fetchReviewQueries(mocks as unknown as NonNullable<Parameters<typeof fetchReviewQueries>[0]>)

    expect(result.reviewRequestsResult).toEqual({ data: null, error: rpcError })
    expect(result.reviewEventsResult).toEqual({ data: null, error: rpcError })
    expect(result.reviewReadReceiptsResult).toEqual({ data: null, error: rpcError })
  })

  it('fails closed when the required RPC returns a null envelope without an error', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })

    const result = await fetchReviewQueries(mocks as unknown as NonNullable<Parameters<typeof fetchReviewQueries>[0]>)

    expect(result.reviewRequestsResult.data).toBeNull()
    expect(result.reviewRequestsResult.error).toBeInstanceOf(Error)
    expect((result.reviewRequestsResult.error as Error).message).toContain('null envelope')
    expect(result.reviewSnapshotAt).toBeNull()
  })

  it('surfaces the envelope snapshot_at as reviewSnapshotAt evidence for lastSyncedAt', async () => {
    mocks.rpc.mockResolvedValue({
      data: { schema_version: 2, snapshot_at: '2026-07-20T00:00:00.000Z', requests: [], events: [], read_receipts: [], unread_count: 0 },
      error: null,
    })

    const result = await fetchReviewQueries(mocks as unknown as NonNullable<Parameters<typeof fetchReviewQueries>[0]>)

    expect(result.reviewSnapshotAt).toBe('2026-07-20T00:00:00.000Z')
  })

  it('fails closed on a schema_version mismatch instead of reading an unrecognized shape', async () => {
    mocks.rpc.mockResolvedValue({
      data: { schema_version: 99, snapshot_at: '2026-07-20T00:00:00.000Z', requests: [], events: [], read_receipts: [], unread_count: 0 },
      error: null,
    })

    const result = await fetchReviewQueries(mocks as unknown as NonNullable<Parameters<typeof fetchReviewQueries>[0]>)

    expect(result.reviewRequestsResult.data).toBeNull()
    expect(result.reviewRequestsResult.error).toBeInstanceOf(Error)
    expect((result.reviewRequestsResult.error as Error).message).toContain('schema_version mismatch')
    expect(result.reviewSnapshotAt).toBeNull()
  })

  it.each([
    ['snapshot_at', { schema_version: 2, snapshot_at: null, requests: [], events: [], read_receipts: [], unread_count: 0 }],
    ['requests', { schema_version: 2, snapshot_at: '2026-07-20T00:00:00.000Z', events: [], read_receipts: [], unread_count: 0 }],
    ['unread_count', { schema_version: 2, snapshot_at: '2026-07-20T00:00:00.000Z', requests: [], events: [], read_receipts: [], unread_count: -1 }],
  ])('fails closed when required field %s is absent or invalid', async (_field, data) => {
    mocks.rpc.mockResolvedValue({ data, error: null })
    const result = await fetchReviewQueries(mocks as unknown as NonNullable<Parameters<typeof fetchReviewQueries>[0]>)
    expect(result.reviewRequestsResult.data).toBeNull()
    expect(result.reviewRequestsResult.error).toBeInstanceOf(Error)
    expect(result.reviewSnapshotAt).toBeNull()
  })
})

describe('fetchReviewEventsPage cursor paging', () => {
  beforeEach(() => mocks.rpc.mockReset())

  it('calls list_review_events_page_v2 with a clamped limit and preserves bigint ids as strings', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id: '42', event_type: 'submitted' }], error: null })

    const result = await fetchReviewEventsPage('review-1', 42, 500)

    expect(mocks.rpc).toHaveBeenCalledWith('list_review_events_page_v2', {
      p_review_request_id: 'review-1',
      p_before_id: '42',
      p_limit: 100,
    })
    expect(result).toEqual([{ id: '42', event_type: 'submitted' }])
  })

  it('clamps a limit below 1 up to 1', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null })

    await fetchReviewEventsPage('review-1', null, 0)

    expect(mocks.rpc).toHaveBeenCalledWith('list_review_events_page_v2', {
      p_review_request_id: 'review-1',
      p_before_id: null,
      p_limit: 1,
    })
  })

  it('throws on RPC error instead of returning a partial page', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'not found' } })

    await expect(fetchReviewEventsPage('review-1')).rejects.toEqual({ message: 'not found' })
  })
})

describe('fetchReviewStatisticsV2 leader-only server aggregate', () => {
  beforeEach(() => mocks.rpc.mockReset())

  it('forwards from/to/requesterId/status as the RPC parameter names', async () => {
    const envelope = validStatisticsEnvelope({ requester_id: 'member-1', status: 'pending' })
    mocks.rpc.mockResolvedValue({ data: envelope, error: null })

    const result = await fetchReviewStatisticsV2({
      from: '2026-07-01',
      to: '2026-07-31',
      requesterId: 'member-1',
      status: 'pending',
    })

    expect(mocks.rpc).toHaveBeenCalledWith('get_review_statistics_v2', {
      p_from: '2026-07-01',
      p_to: '2026-07-31',
      p_requester_id: 'member-1',
      p_status: 'pending',
    })
    expect(result).toBe(envelope)
  })

  it('defaults requesterId/status to null when omitted', async () => {
    mocks.rpc.mockResolvedValue({ data: validStatisticsEnvelope(), error: null })

    await fetchReviewStatisticsV2({ from: '2026-07-01', to: '2026-07-31' })

    expect(mocks.rpc).toHaveBeenCalledWith('get_review_statistics_v2', {
      p_from: '2026-07-01',
      p_to: '2026-07-31',
      p_requester_id: null,
      p_status: null,
    })
  })

  it('throws on RPC error', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'active leader required' } })

    await expect(fetchReviewStatisticsV2({ from: '2026-07-01', to: '2026-07-31' })).rejects.toEqual({
      message: 'active leader required',
    })
  })

  it('fails closed when the aggregate envelope omits the authoritative requester breakdown', async () => {
    mocks.rpc.mockResolvedValue({ data: { schema_version: 2 }, error: null })

    await expect(fetchReviewStatisticsV2({ from: '2026-07-01', to: '2026-07-31' }))
      .rejects.toThrow('invalid aggregate envelope')
  })

  it.each([
    ['generated_at', { generated_at: null }],
    ['pending_count', { pending_count: Number.NaN }],
    ['month_end_backlog', { month_end_backlog: null }],
    ['monthly_breakdown', { monthly_breakdown: null }],
    ['requester row count', { requester_breakdown: [{ requester_id: 'u1', requester_name: 'U', requester_inactive: false, new_requests: undefined, resubmissions: 0, approvals: 0, rejections: 0, pending_count: 0 }] }],
  ])('fails closed when aggregate field %s is absent or invalid', async (_field, override) => {
    mocks.rpc.mockResolvedValue({ data: validStatisticsEnvelope(override), error: null })
    await expect(fetchReviewStatisticsV2({ from: '2026-07-01', to: '2026-07-31' }))
      .rejects.toThrow('invalid aggregate envelope')
  })
})
