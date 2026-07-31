import { describe, expect, it } from 'vitest'
import type { ReviewRequest } from '../types'
import {
  buildLocalReviewHistoryPage,
  isLeaderDefaultReviewRequest,
  matchesReviewSearch,
} from './reviewHistory'

function terminalReview(
  id: string,
  status: 'approved' | 'rejected' | 'withdrawn',
  terminalAt: string,
  overrides: Partial<ReviewRequest> = {},
): ReviewRequest {
  return {
    id,
    requester_id: 'member-1',
    title: `제목 ${id}`,
    description: `본문 ${id}`,
    due_date: null,
    status,
    closed_at: terminalAt,
    withdrawn_at: status === 'withdrawn' ? terminalAt : null,
    created_at: terminalAt,
    updated_at: terminalAt,
    profiles: { name: '김요청', email: 'member@example.com' },
    review_feedback: [],
    ...overrides,
  }
}

describe('reviewHistory', () => {
  const now = new Date('2026-08-01T03:00:00.000Z') // 2026-08-01 12:00 KST

  it('keeps every pending request and the seven KST calendar days including today', () => {
    const pending = { ...terminalReview('pending', 'approved', '2025-01-01T00:00:00.000Z'), status: 'pending' as const }
    const seventhDay = terminalReview('seventh', 'approved', '2026-07-25T15:00:00.000Z') // Jul 26 KST
    const older = terminalReview('older', 'approved', '2026-07-25T14:59:59.999Z')

    expect(isLeaderDefaultReviewRequest(pending, now)).toBe(true)
    expect(isLeaderDefaultReviewRequest(seventhDay, now)).toBe(true)
    expect(isLeaderDefaultReviewRequest(older, now)).toBe(false)
  })

  it('searches title, description, and requester name case-insensitively', () => {
    const request = terminalReview('search', 'rejected', '2026-07-20T00:00:00.000Z', {
      title: 'CAPA 검토',
      description: '변경 영향 평가',
      profiles: { name: '박담당', email: 'member@example.com' },
    })

    expect(matchesReviewSearch(request, 'capa')).toBe(true)
    expect(matchesReviewSearch(request, '영향')).toBe(true)
    expect(matchesReviewSearch(request, '박담당')).toBe(true)
    expect(matchesReviewSearch(request, '없는 값')).toBe(false)
  })

  it('builds an older-terminal-only 365-day history with a stable cursor', () => {
    const requests = [
      terminalReview('recent', 'approved', '2026-07-31T00:00:00.000Z'),
      terminalReview('b', 'approved', '2026-07-20T00:00:00.000Z'),
      terminalReview('a', 'rejected', '2026-07-20T00:00:00.000Z'),
      terminalReview('expired', 'withdrawn', '2025-07-31T02:59:59.999Z'),
    ]
    const filters = { status: null, query: '', from: null, to: null }

    const first = buildLocalReviewHistoryPage(requests, filters, null, now, 1)
    expect(first.rows.map((row) => row.id)).toEqual(['b'])
    expect(first.has_more).toBe(true)
    expect(first.next_cursor).toEqual({ terminal_at: '2026-07-20T00:00:00.000Z', id: 'b' })

    const second = buildLocalReviewHistoryPage(requests, filters, first.next_cursor, now, 1)
    expect(second.rows.map((row) => row.id)).toEqual(['a'])
    expect(second.has_more).toBe(false)
  })

  it('applies terminal status and KST date filters', () => {
    const requests = [
      terminalReview('approved', 'approved', '2026-07-20T16:00:00.000Z'), // Jul 21 KST
      terminalReview('rejected', 'rejected', '2026-07-21T16:00:00.000Z'), // Jul 22 KST
    ]
    const page = buildLocalReviewHistoryPage(requests, {
      status: 'rejected',
      query: '김요청',
      from: '2026-07-22',
      to: '2026-07-22',
    }, null, now)

    expect(page.rows.map((row) => row.id)).toEqual(['rejected'])
  })
})
