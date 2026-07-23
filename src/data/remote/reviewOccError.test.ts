import { describe, expect, it } from 'vitest'
import { REVIEW_STALE_MESSAGE, translateReviewOccError } from './reviewOccError'
import { UserFacingError } from '../../lib/errors'

describe('translateReviewOccError', () => {
  it('maps review OCC conflict text to the Korean stale message', () => {
    const translated = translateReviewOccError({ message: 'review changed since it was opened' })
    expect(translated).toBeInstanceOf(UserFacingError)
    expect(translated.message).toBe(REVIEW_STALE_MESSAGE)
  })

  it.each([
    ['SQA_REVIEW_TITLE_INVALID', '검토요청 제목은 2~200자로 입력해 주세요.'],
    ['SQA_REVIEW_DESCRIPTION_INVALID', '검토요청 설명은 2~20,000자로 입력해 주세요.'],
    ['SQA_REVIEW_DUE_DATE_PAST', '검토 기한은 오늘 또는 이후 날짜로 선택해 주세요.'],
  ])('maps the stable input marker %s from PostgREST details', (details, expectedMessage) => {
    const translated = translateReviewOccError({ message: 'review input is invalid', details })
    expect(translated).toBeInstanceOf(UserFacingError)
    expect(translated.message).toBe(expectedMessage)
  })

  it('leaves unrelated errors untouched', () => {
    const original = { message: 'active leader required' }
    expect(translateReviewOccError(original)).toBe(original)
  })
})
