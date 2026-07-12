import { describe, expect, it } from 'vitest'
import type { ReviewRequest } from '../types'
import { compareReviewRequests, reviewPriorityScore } from './priority'

function makeRequest(overrides: Partial<ReviewRequest>): ReviewRequest {
  return {
    id: 'r1',
    requester_id: 'u1',
    title: 'Test',
    description: 'Desc',
    attachment_url: null,
    due_date: null,
    status: 'pending',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('reviewPriorityScore', () => {
  const now = new Date('2026-07-05T12:00:00')

  it('ranks pending before rejected and approved', () => {
    const pending = makeRequest({ status: 'pending' })
    const rejected = makeRequest({ status: 'rejected' })
    const approved = makeRequest({ status: 'approved' })
    expect(reviewPriorityScore(pending, now)).toBeLessThan(reviewPriorityScore(rejected, now))
    expect(reviewPriorityScore(rejected, now)).toBeLessThan(reviewPriorityScore(approved, now))
  })

  it('sorts closed requests after active ones in leader view', () => {
    const active = makeRequest({ id: 'a', status: 'pending' })
    const closed = makeRequest({ id: 'b', status: 'approved' })
    expect(compareReviewRequests(active, closed)).toBeLessThan(0)
  })

  it('orders a mixed leader list as pending → rejected → approved regardless of created_at', () => {
    const sorted = [
      makeRequest({ id: '1', status: 'approved', created_at: '2026-07-03T00:00:00.000Z' }),
      makeRequest({ id: '2', status: 'pending', created_at: '2026-07-01T00:00:00.000Z' }),
      makeRequest({ id: '3', status: 'rejected', created_at: '2026-07-02T00:00:00.000Z' }),
    ].sort((left, right) => compareReviewRequests(left, right, false))

    expect(sorted.map((item) => item.id)).toEqual(['2', '3', '1'])
  })

  it('keeps status buckets disjoint even with extreme due dates', () => {
    const farFuturePending = makeRequest({ status: 'pending', due_date: '9999-12-31' })
    const ancientRejected = makeRequest({ status: 'rejected', due_date: '1900-01-01' })
    const ancientApproved = makeRequest({ status: 'approved', due_date: '1900-01-01' })

    expect(reviewPriorityScore(farFuturePending, now)).toBeLessThan(
      reviewPriorityScore(ancientRejected, now),
    )
    expect(reviewPriorityScore(ancientRejected, now)).toBeLessThan(
      reviewPriorityScore(ancientApproved, now),
    )
  })

  it('sorts member view by created_at descending', () => {
    const older = makeRequest({ id: 'old', created_at: '2026-07-01T00:00:00.000Z' })
    const newer = makeRequest({ id: 'new', created_at: '2026-07-04T00:00:00.000Z' })
    expect(compareReviewRequests(newer, older, true)).toBeLessThan(0)
  })

  it('treats missing created_at as oldest in member view', () => {
    const dated = makeRequest({ id: 'dated', created_at: '2026-07-04T00:00:00.000Z' })
    const missing = makeRequest({ id: 'missing', created_at: undefined })
    expect(compareReviewRequests(dated, missing, true)).toBeLessThan(0)
  })
})
