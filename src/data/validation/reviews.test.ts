import { describe, expect, it } from 'vitest'
import { UserFacingError } from '../../lib/errors'
import { normalizeReviewRequestPayload } from './reviews'

const now = new Date('2026-07-23T03:00:00.000Z')

describe('normalizeReviewRequestPayload', () => {
  it('trims valid content and accepts the KST business date boundary', () => {
    expect(normalizeReviewRequestPayload({
      title: '  검토 제목  ',
      description: '  검토 설명  ',
      due_date: '2026-07-23',
    }, { now })).toEqual({
      title: '검토 제목',
      description: '검토 설명',
      due_date: '2026-07-23',
    })
  })

  it.each([
    { title: '한', description: '설명', due_date: null },
    { title: '제목', description: '한', due_date: null },
    { title: 'x'.repeat(201), description: '설명', due_date: null },
    { title: '제목', description: 'x'.repeat(20_001), due_date: null },
  ])('rejects content outside the shared limits', (payload) => {
    expect(() => normalizeReviewRequestPayload(payload, { now })).toThrow(UserFacingError)
  })

  it('rejects a new past due date but preserves an existing past date unchanged', () => {
    const payload = { title: '제목', description: '설명', due_date: '2026-07-22' }
    expect(() => normalizeReviewRequestPayload(payload, { now })).toThrow('오늘보다 이전')
    expect(normalizeReviewRequestPayload(payload, {
      now,
      existingDueDate: '2026-07-22',
    }).due_date).toBe('2026-07-22')
  })
})
