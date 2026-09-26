import { describe, expect, it } from 'vitest'
import { UserFacingError } from '../../lib/errors'
import {
  assertRejectReason,
  assertResubmitNote,
  normalizeReviewRequestPayload,
  REJECT_REASON_REQUIRED_MESSAGE,
  rejectReasonError,
  RESUBMIT_NOTE_REQUIRED_MESSAGE,
  resubmitNoteError,
} from './reviews'

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
    expect(() => normalizeReviewRequestPayload(payload, { now })).toThrow('오늘이나 그 이후 날짜')
    expect(normalizeReviewRequestPayload(payload, {
      now,
      existingDueDate: '2026-07-22',
    }).due_date).toBe('2026-07-22')
  })
})

describe('reject reason', () => {
  it.each(['', '   ', '\n\t'])('requires a non-blank reason (%j)', (reason) => {
    expect(rejectReasonError(reason)).toBe(REJECT_REASON_REQUIRED_MESSAGE)
    expect(() => assertRejectReason(reason)).toThrow(UserFacingError)
  })

  it('accepts a trimmed reason up to 2,000 characters', () => {
    expect(rejectReasonError('  표를 추가해 주세요  ')).toBeNull()
    expect(rejectReasonError('x'.repeat(2000))).toBeNull()
    expect(rejectReasonError('x'.repeat(2001))).toMatch(/2,000자 이하/)
  })
})

describe('resubmit note', () => {
  it('matches the server minimum of two characters', () => {
    expect(resubmitNoteError(' 네 ')).toBe(RESUBMIT_NOTE_REQUIRED_MESSAGE)
    expect(() => assertResubmitNote('')).toThrow(UserFacingError)
    expect(resubmitNoteError('표를 추가했어요')).toBeNull()
  })
})
