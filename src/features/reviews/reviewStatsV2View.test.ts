import { describe, expect, it, vi } from 'vitest'
import type { ReviewStatisticsV2Envelope, ReviewStatisticsV2Params } from '../../types'
import { loadReviewStatsV2View, ZERO_REVIEW_STATS_V2_KPIS } from './reviewStatsV2View'
import type { ReviewStatsFilters, ReviewStatsRequesterOption } from './reviewStats.selectors'

function envelope(overrides: Partial<ReviewStatisticsV2Envelope> = {}): ReviewStatisticsV2Envelope {
  return {
    schema_version: 2,
    timezone: 'Asia/Seoul',
    generated_at: '2026-07-15T00:00:00.000Z',
    from: '2026-01-16',
    to: '2026-07-15',
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

function baseFilters(overrides: Partial<ReviewStatsFilters> = {}): ReviewStatsFilters {
  return {
    preset: 'last-6-months',
    requesterId: 'all',
    status: 'all',
    customStartDate: '2026-01-16',
    customEndDate: '2026-07-15',
    ...overrides,
  }
}

const range = { startDate: '2026-06-01', endDate: '2026-07-15' }

describe('loadReviewStatsV2View', () => {
  it('maps the overall envelope onto kpis (requestCount, submissionCount, etc.)', async () => {
    const fetchStatistics = vi.fn(async () =>
      envelope({ new_requests: 3, resubmissions: 2, approvals: 1, rejections: 1, pending_count: 4 }),
    )

    const result = await loadReviewStatsV2View({
      fetchStatistics,
      range,
      filters: baseFilters(),
      requesterOptions: [],
    })

    expect(result.kpis).toEqual({
      requestCount: 3,
      submissionCount: 5,
      resubmissionCount: 2,
      pendingCount: 4,
      approvedCount: 1,
      rejectedCount: 1,
    })
  })

  it('never calls fetchStatistics with a from/to outside the selected range', async () => {
    const seen: ReviewStatisticsV2Params[] = []
    const fetchStatistics = vi.fn(async (params: ReviewStatisticsV2Params) => {
      seen.push(params)
      return envelope()
    })

    await loadReviewStatsV2View({
      fetchStatistics,
      range,
      filters: baseFilters(),
      requesterOptions: [{ id: 'member-1', name: '요청자', inactive: false }],
    })

    for (const params of seen) {
      expect(params.from >= range.startDate).toBe(true)
      expect(params.to <= range.endDate).toBe(true)
    }
  })

  it('uses the authoritative requester breakdown from the overall envelope instead of relying on bootstrap options', async () => {
    const options: ReviewStatsRequesterOption[] = [
      { id: 'member-1', name: '가나다', inactive: false },
      { id: 'member-2', name: '마바사', inactive: false },
      { id: 'member-3', name: '아자차', inactive: false },
    ]
    const fetchStatistics = vi.fn(async (_params: ReviewStatisticsV2Params) => envelope({
      new_requests: 3,
      requester_breakdown: [
        { requester_id: 'member-1', requester_name: '가나다', requester_inactive: false, new_requests: 1, resubmissions: 0, approvals: 0, rejections: 0, pending_count: 0 },
        { requester_id: 'member-2', requester_name: '마바사', requester_inactive: false, new_requests: 1, resubmissions: 0, approvals: 0, rejections: 0, pending_count: 0 },
        { requester_id: 'member-3', requester_name: '아자차', requester_inactive: false, new_requests: 1, resubmissions: 0, approvals: 0, rejections: 0, pending_count: 0 },
      ],
    }))

    await loadReviewStatsV2View({
      fetchStatistics,
      range,
      filters: baseFilters(),
      requesterOptions: options,
    })

    expect(fetchStatistics).toHaveBeenCalledTimes(1)
    expect(fetchStatistics.mock.calls.some(([params]) => params.requesterId != null)).toBe(false)
  })

  it('reuses the overall envelope instead of refetching when a single requester is already selected', async () => {
    const fetchStatistics = vi.fn(async () => envelope({
      new_requests: 7,
      requester_id: 'member-1',
      requester_breakdown: [
        { requester_id: 'member-1', requester_name: '요청자', requester_inactive: false, new_requests: 7, resubmissions: 0, approvals: 0, rejections: 0, pending_count: 0 },
      ],
    }))

    const result = await loadReviewStatsV2View({
      fetchStatistics,
      range,
      filters: baseFilters({ requesterId: 'member-1' }),
      requesterOptions: [{ id: 'member-1', name: '요청자', inactive: false }],
    })

    expect(fetchStatistics).toHaveBeenCalledTimes(1)
    expect(result.requesterRows).toEqual([
      expect.objectContaining({ requesterId: 'member-1', requestCount: 7 }),
    ])
  })

  it('drops requester rows with zero activity across every field, mirroring the old client selector', async () => {
    const fetchStatistics = vi.fn(async () => envelope({
      new_requests: 1,
      requester_breakdown: [
        { requester_id: 'member-1', requester_name: '활동자', requester_inactive: false, new_requests: 1, resubmissions: 0, approvals: 0, rejections: 0, pending_count: 0 },
      ],
    }))

    const result = await loadReviewStatsV2View({
      fetchStatistics,
      range,
      filters: baseFilters(),
      requesterOptions: [
        { id: 'member-1', name: '활동함', inactive: false },
        { id: 'member-2', name: '활동없음', inactive: false },
      ],
    })

    expect(result.requesterRows).toHaveLength(1)
    expect(result.requesterRows[0].requesterId).toBe('member-1')
  })

  it('keeps every KPI equal to the sum of authoritative requester rows', async () => {
    const fetchStatistics = vi.fn(async () => envelope({
      new_requests: 3,
      resubmissions: 2,
      approvals: 1,
      rejections: 2,
      pending_count: 4,
      requester_breakdown: [
        { requester_id: 'member-a', requester_name: 'A', requester_inactive: false, new_requests: 1, resubmissions: 2, approvals: 0, rejections: 1, pending_count: 3 },
        { requester_id: 'member-b', requester_name: 'B', requester_inactive: false, new_requests: 2, resubmissions: 0, approvals: 1, rejections: 1, pending_count: 1 },
      ],
    }))

    const result = await loadReviewStatsV2View({
      fetchStatistics,
      range,
      filters: baseFilters(),
      requesterOptions: [],
    })

    for (const key of Object.keys(result.kpis) as Array<keyof typeof result.kpis>) {
      expect(result.requesterRows.reduce((sum, row) => sum + row[key], 0)).toBe(result.kpis[key])
    }
  })

  it('builds one monthly row per calendar month touched by the range, sourced from month_end_backlog for pending', async () => {
    const fetchStatistics = vi.fn(async (_params: ReviewStatisticsV2Params) =>
      envelope({
        monthly_breakdown: [
          { month: '2026-06', new_requests: 2, resubmissions: 1, approvals: 0, rejections: 0, month_end_backlog: 5 },
          { month: '2026-07', new_requests: 2, resubmissions: 1, approvals: 0, rejections: 0, month_end_backlog: 5 },
        ],
      }),
    )

    const result = await loadReviewStatsV2View({
      fetchStatistics,
      range,
      filters: baseFilters(),
      requesterOptions: [],
    })

    expect(result.monthlyRows).toEqual([
      { month: '2026-06', requestCount: 2, submissionCount: 3, resubmissionCount: 1, pendingCount: 5, approvedCount: 0, rejectedCount: 0 },
      { month: '2026-07', requestCount: 2, submissionCount: 3, resubmissionCount: 1, pendingCount: 5, approvedCount: 0, rejectedCount: 0 },
    ])
  })

  it('propagates a rejected fetchStatistics call instead of silently returning zeros', async () => {
    const fetchStatistics = vi.fn(async () => {
      throw new Error('active leader required')
    })

    await expect(
      loadReviewStatsV2View({ fetchStatistics, range, filters: baseFilters(), requesterOptions: [] }),
    ).rejects.toThrow('active leader required')
  })

  it('exposes an all-zero kpis constant for callers to fail closed before the first load resolves', () => {
    expect(ZERO_REVIEW_STATS_V2_KPIS).toEqual({
      requestCount: 0,
      submissionCount: 0,
      resubmissionCount: 0,
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
    })
  })
})
