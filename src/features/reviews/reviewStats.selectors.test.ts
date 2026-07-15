import { describe, expect, it } from 'vitest'
import type { AppData, Profile, ReviewRequest, ReviewStatus } from '../../types'
import {
  getReviewStatsAvailableRange,
  resolveReviewStatsRange,
  reviewSubmissionCount,
  selectReviewStats,
  type ReviewStatsFilters,
} from './reviewStats.selectors'

const now = new Date(2026, 6, 15, 12)
const profiles: Profile[] = [
  { id: 'member-a', email: 'a@example.com', name: '가 요청자', role: 'member' },
  { id: 'member-b', email: 'b@example.com', name: '나 요청자', role: 'member', is_active: false },
]

function localIso(year: number, month: number, day: number, hour = 12, minute = 0, second = 0, millisecond = 0) {
  return new Date(year, month - 1, day, hour, minute, second, millisecond).toISOString()
}

function review(
  id: string,
  requesterId: string,
  createdAt: string,
  status: ReviewStatus,
  reviewRound?: number,
): ReviewRequest {
  return {
    id,
    requester_id: requesterId,
    title: id,
    description: '',
    attachment_url: null,
    due_date: null,
    status,
    review_round: reviewRound,
    created_at: createdAt,
    profiles: { name: profiles.find((profile) => profile.id === requesterId)?.name ?? '외부 요청자', email: '' },
  }
}

function data(reviewRequests: ReviewRequest[]): Pick<AppData, 'profiles' | 'reviewRequests'> {
  return { profiles, reviewRequests }
}

function filters(overrides: Partial<ReviewStatsFilters> = {}): ReviewStatsFilters {
  return {
    preset: 'last-6-months',
    requesterId: 'all',
    status: 'all',
    customStartDate: '2026-01-16',
    customEndDate: '2026-07-15',
    ...overrides,
  }
}

describe('reviewStats.selectors', () => {
  it('starts at the first fully loaded local day and excludes older pending requests too', () => {
    expect(getReviewStatsAvailableRange(now)).toEqual({ minDate: '2026-01-16', maxDate: '2026-07-15' })
    expect(getReviewStatsAvailableRange(new Date(2026, 6, 15, 0, 0, 0, 0))).toEqual({
      minDate: '2026-01-15',
      maxDate: '2026-07-15',
    })

    const result = selectReviewStats(
      data([
        review('partial-boundary', 'member-a', localIso(2026, 1, 15, 23, 59), 'approved', 1),
        review('first-full-day', 'member-a', localIso(2026, 1, 16, 0, 0), 'approved', 1),
        review('old-pending', 'member-a', localIso(2026, 1, 14), 'pending', 4),
        review('today', 'member-b', localIso(2026, 7, 15), 'pending', 1),
        review('future-day', 'member-b', localIso(2026, 7, 16), 'pending', 1),
      ]),
      filters(),
      now,
    )

    expect(result.filteredRequests.map((request) => request.id)).toEqual(['first-full-day', 'today'])
    expect(result.kpis.requestCount).toBe(2)
  })

  it('uses inclusive local start and end dates without leaking adjacent dates', () => {
    const result = selectReviewStats(
      data([
        review('before', 'member-a', localIso(2026, 6, 9, 23, 59, 59, 999), 'approved', 1),
        review('start', 'member-a', localIso(2026, 6, 10, 0, 0), 'approved', 1),
        review('end', 'member-a', localIso(2026, 6, 10, 23, 59, 59, 999), 'approved', 1),
        review('after', 'member-a', localIso(2026, 6, 11, 0, 0), 'approved', 1),
      ]),
      filters({ preset: 'custom', customStartDate: '2026-06-10', customEndDate: '2026-06-10' }),
      now,
    )

    expect(result.filteredRequests.map((request) => request.id)).toEqual(['start', 'end'])
  })

  it('keeps request rows separate from the review_round submission sum', () => {
    const result = selectReviewStats(
      data([
        review('a-1', 'member-a', localIso(2026, 5, 1), 'approved', 3),
        review('a-2', 'member-a', localIso(2026, 5, 2), 'rejected', 2),
        review('b-1', 'member-b', localIso(2026, 6, 1), 'pending'),
      ]),
      filters(),
      now,
    )

    expect(result.kpis).toEqual({
      requestCount: 3,
      submissionCount: 6,
      resubmissionCount: 3,
      pendingCount: 1,
      approvedCount: 1,
      rejectedCount: 1,
    })
    expect(result.requesterRows[0]).toMatchObject({
      requesterId: 'member-a',
      requestCount: 2,
      submissionCount: 5,
      resubmissionCount: 3,
    })
    expect(result.requesterRows[1]).toMatchObject({
      requesterId: 'member-b',
      requesterInactive: true,
      requestCount: 1,
      submissionCount: 1,
      resubmissionCount: 0,
    })
  })

  it('normalizes absent or invalid review_round values to the first submission only', () => {
    expect(reviewSubmissionCount(review('missing', 'member-a', localIso(2026, 5, 1), 'pending'))).toBe(1)
    expect(reviewSubmissionCount(review('zero', 'member-a', localIso(2026, 5, 1), 'pending', 0))).toBe(1)
    expect(reviewSubmissionCount(review('fraction', 'member-a', localIso(2026, 5, 1), 'pending', 2.9))).toBe(2)
  })

  it('applies custom date, requester, and status filters before every aggregate', () => {
    const requests = [
      review('a-approved', 'member-a', localIso(2026, 6, 10), 'approved', 2),
      review('a-pending', 'member-a', localIso(2026, 6, 11), 'pending', 1),
      review('b-approved', 'member-b', localIso(2026, 6, 12), 'approved', 4),
      review('outside', 'member-a', localIso(2026, 5, 31), 'approved', 9),
    ]
    const originalOrder = requests.map((request) => request.id)

    const result = selectReviewStats(
      data(requests),
      filters({
        preset: 'custom',
        requesterId: 'member-a',
        status: 'approved',
        customStartDate: '2026-06-01',
        customEndDate: '2026-06-30',
      }),
      now,
    )

    expect(result.filteredRequests.map((request) => request.id)).toEqual(['a-approved'])
    expect(result.kpis.requestCount).toBe(1)
    expect(result.kpis.submissionCount).toBe(2)
    expect(result.statusCounts).toEqual({ pending: 0, approved: 1, rejected: 0 })
    expect(result.monthlyRows).toEqual([
      {
        month: '2026-06',
        requestCount: 1,
        submissionCount: 2,
        resubmissionCount: 1,
        pendingCount: 0,
        approvedCount: 1,
        rejectedCount: 0,
      },
    ])
    expect(requests.map((request) => request.id)).toEqual(originalOrder)
  })

  it('keeps zero-filled month buckets and zero-safe totals across the selected range', () => {
    const result = selectReviewStats(
      data([review('one', 'member-a', localIso(2026, 5, 20), 'approved', 1)]),
      filters({
        preset: 'custom',
        requesterId: 'member-b',
        customStartDate: '2026-04-20',
        customEndDate: '2026-06-05',
      }),
      now,
    )

    expect(result.kpis).toEqual({
      requestCount: 0,
      submissionCount: 0,
      resubmissionCount: 0,
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
    })
    expect(result.statusCounts).toEqual({ pending: 0, approved: 0, rejected: 0 })
    expect(result.monthlyRows.map((row) => [row.month, row.requestCount, row.submissionCount])).toEqual([
      ['2026-04', 0, 0],
      ['2026-05', 0, 0],
      ['2026-06', 0, 0],
    ])
  })

  it('resolves the this-month and recent-three-month presets from the current local date', () => {
    expect(resolveReviewStatsRange(filters({ preset: 'this-month' }), now)).toMatchObject({
      startDate: '2026-07-01',
      endDate: '2026-07-15',
      valid: true,
    })
    expect(resolveReviewStatsRange(filters({ preset: 'last-3-months' }), now)).toMatchObject({
      startDate: '2026-04-15',
      endDate: '2026-07-15',
      valid: true,
    })
  })

  it('clamps custom ranges to the loaded window and reports invalid ordering', () => {
    const clamped = resolveReviewStatsRange(
      filters({
        preset: 'custom',
        customStartDate: '2025-01-01',
        customEndDate: '2027-01-01',
      }),
      now,
    )
    expect(clamped).toMatchObject({
      startDate: '2026-01-16',
      endDate: '2026-07-15',
      valid: true,
      wasClamped: true,
    })

    const invalid = resolveReviewStatsRange(
      filters({
        preset: 'custom',
        customStartDate: '2026-07-01',
        customEndDate: '2026-06-01',
      }),
      now,
    )
    expect(invalid.valid).toBe(false)
    expect(invalid.validationMessage).toBe('시작일은 종료일보다 늦을 수 없습니다.')

    const outside = resolveReviewStatsRange(
      filters({
        preset: 'custom',
        customStartDate: '2025-11-01',
        customEndDate: '2025-12-31',
      }),
      now,
    )
    expect(outside).toMatchObject({
      startDate: '2026-01-16',
      endDate: '2026-01-16',
      valid: false,
      wasClamped: true,
      validationMessage: '선택한 기간이 조회 가능한 최근 6개월 범위와 겹치지 않습니다.',
    })
  })

  it('keeps inactive requesters visible in both filter options and exact rows', () => {
    const result = selectReviewStats(
      data([review('inactive-row', 'member-b', localIso(2026, 6, 1), 'approved', 1)]),
      filters(),
      now,
    )

    expect(result.requesterOptions).toContainEqual({ id: 'member-b', name: '나 요청자', inactive: true })
    expect(result.requesterRows[0]).toMatchObject({
      requesterId: 'member-b',
      requesterName: '나 요청자',
      requesterInactive: true,
    })
  })

  it('falls back to embedded requester identity when the profile row is unavailable', () => {
    const request = review('removed-profile', 'removed-member', localIso(2026, 6, 1), 'approved', 1)
    request.profiles = { name: '삭제된 계정 요청자', email: 'removed@example.com' }
    const result = selectReviewStats({ profiles: [], reviewRequests: [request] }, filters(), now)

    expect(result.requesterOptions).toEqual([
      { id: 'removed-member', name: '삭제된 계정 요청자', inactive: false },
    ])
    expect(result.requesterRows[0]?.requesterName).toBe('삭제된 계정 요청자')
  })
})
