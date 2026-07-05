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

  it('sorts member view by created_at descending', () => {
    const older = makeRequest({ id: 'old', created_at: '2026-07-01T00:00:00.000Z' })
    const newer = makeRequest({ id: 'new', created_at: '2026-07-04T00:00:00.000Z' })
    expect(compareReviewRequests(newer, older, true)).toBeLessThan(0)
  })
})
