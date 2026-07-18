import { describe, expect, it } from 'vitest'
import {
  mergeReviewRequests,
  reviewHistoryCutoff,
  REVIEW_HISTORY_MONTHS,
  REVIEW_REQUEST_SELECT,
} from './fetchAppData'
import type { ReviewRequest } from '../types'

function review(id: string, created_at: string, status: ReviewRequest['status'] = 'approved'): ReviewRequest {
  return {
    id,
    requester_id: 'member-1',
    title: id,
    description: '',
    due_date: null,
    status,
    created_at,
    updated_at: created_at,
    profiles: { name: 'Member', email: 'member@example.com' },
    review_feedback: [],
  }
}

describe('review request load budget', () => {
  it('never returns the compatibility-only attachment column to the browser', () => {
    expect(REVIEW_REQUEST_SELECT).not.toContain('attachment_url')
    expect(REVIEW_REQUEST_SELECT).not.toContain('*')
  })

  it('pins profile embeds to the intended foreign keys after review audit relationships are added', () => {
    expect(REVIEW_REQUEST_SELECT).toContain('profiles!review_requests_requester_id_fkey(name,email)')
    expect(REVIEW_REQUEST_SELECT).toContain('profiles!review_feedback_leader_id_fkey(name)')
    expect(REVIEW_REQUEST_SELECT.match(/profiles!/g)).toHaveLength(2)
    expect(REVIEW_REQUEST_SELECT).not.toMatch(/(^|,)profiles\(/)
  })

  it('uses the same six-month boundary as the dashboard history window', () => {
    expect(REVIEW_HISTORY_MONTHS).toBe(6)
    expect(reviewHistoryCutoff(new Date('2026-07-11T00:00:00.000Z'))).toBe('2026-01-11T00:00:00.000Z')
  })

  it('clamps month-end cutoffs instead of overflowing into the following month', () => {
    expect(reviewHistoryCutoff(new Date('2026-08-31T12:00:00.000Z'))).toBe('2026-02-28T12:00:00.000Z')
  })

  it('merges pending and recent closed rows without duplicate ids', () => {
    const result = mergeReviewRequests(
      [review('pending', '2026-01-01T00:00:00.000Z', 'pending'), review('same', '2026-01-02T00:00:00.000Z', 'pending')],
      [review('same', '2026-01-02T00:00:00.000Z'), review('closed', '2026-07-01T00:00:00.000Z')],
    )

    expect(result.map((item) => item.id)).toEqual(['closed', 'same', 'pending'])
    expect(result.filter((item) => item.id === 'same')).toHaveLength(1)
  })

  it('keeps the freshest overlapping row when status queries race', () => {
    const result = mergeReviewRequests(
      [
        {
          ...review('same', '2026-01-02T00:00:00.000Z', 'pending'),
          updated_at: '2026-07-11T00:05:00.000Z',
        },
      ],
      [
        {
          ...review('same', '2026-01-02T00:00:00.000Z', 'rejected'),
          updated_at: '2026-07-11T00:04:00.000Z',
        },
      ],
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.status).toBe('pending')
    expect(result[0]?.updated_at).toBe('2026-07-11T00:05:00.000Z')
  })

  it('unions embedded feedback when parent timestamps are equal', () => {
    const left = review('same', '2026-07-11T00:00:00.000Z', 'pending')
    left.review_feedback = [{ id: 'feedback-old', review_request_id: left.id, leader_id: 'leader-1', comment: 'old', created_at: '2026-07-11T00:01:00.000Z' }]
    const right = review('same', '2026-07-11T00:00:00.000Z', 'pending')
    right.review_feedback = [{ id: 'feedback-new', review_request_id: right.id, leader_id: 'leader-1', comment: 'new', created_at: '2026-07-11T00:02:00.000Z' }]

    const result = mergeReviewRequests([left], [right])
    expect(result[0]?.review_feedback?.map((item) => item.id)).toEqual(['feedback-old', 'feedback-new'])
  })
})
