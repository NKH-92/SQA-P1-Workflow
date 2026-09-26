import { describe, expect, it } from 'vitest'
import { emptyReviewForm } from './useReviewDraft'
import { firstInvalidReviewField, validateReviewComposer } from './reviewComposerValidation'

const today = '2026-07-23'

describe('validateReviewComposer', () => {
  it('asks for every missing required field in reading order', () => {
    const errors = validateReviewComposer({ ...emptyReviewForm, deadlineMode: 'date' }, { today, note: '' })

    expect(errors).toEqual({
      title: '제목을 입력해 주세요.',
      description: '설명을 입력해 주세요.',
      due_date: '기한 날짜를 골라 주세요.',
      note: '재요청 내용을 2자 이상 적어 주세요.',
    })
    expect(firstInvalidReviewField(errors)).toBe('title')
  })

  it('keeps the shared length limits', () => {
    const errors = validateReviewComposer(
      { ...emptyReviewForm, title: '한', description: 'x'.repeat(20_001) },
      { today },
    )
    expect(errors.title).toBe('제목은 2자 이상 입력해 주세요.')
    expect(errors.description).toBe('설명은 20,000자 이하로 입력해 주세요.')
    expect(errors.note).toBeUndefined()
  })

  it('rejects a new past due date but keeps an unchanged existing one', () => {
    const form = { ...emptyReviewForm, title: '제목', description: '설명', deadlineMode: 'date' as const, due_date: '2026-07-22' }
    expect(validateReviewComposer(form, { today }).due_date).toBe('기한은 오늘이나 그 이후 날짜로 골라 주세요.')
    expect(validateReviewComposer(form, { today, existingDueDate: '2026-07-22' })).toEqual({})
    expect(firstInvalidReviewField({})).toBeNull()
  })
})
