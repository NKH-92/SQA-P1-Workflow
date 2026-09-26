import { describe, expect, it } from 'vitest'
import { REVIEW_NOT_FOUND_MESSAGE, REVIEW_STALE_MESSAGE, translateReviewOccError } from './reviewOccError'
import { UserFacingError } from '../../lib/errors'

describe('translateReviewOccError', () => {
  it('maps review OCC conflict text to the Korean stale message', () => {
    const translated = translateReviewOccError({ message: 'review changed since it was opened' })
    expect(translated).toBeInstanceOf(UserFacingError)
    expect(translated.message).toBe(REVIEW_STALE_MESSAGE)
    expect(translated.message).toBe('다른 사람이 먼저 수정했어요. 새로고침한 뒤 다시 시도해 주세요.')
  })

  it.each([
    ['SQA_REVIEW_TITLE_INVALID', '제목은 2~200자로 입력해 주세요.'],
    ['SQA_REVIEW_DESCRIPTION_INVALID', '설명은 2~20,000자로 입력해 주세요.'],
    ['SQA_REVIEW_DUE_DATE_PAST', '기한은 오늘이나 그 이후 날짜로 골라 주세요.'],
    ['SQA_REVIEW_COMMENT_REQUIRED', '재요청 내용을 2자 이상 적어 주세요.'],
  ])('maps the stable input marker %s from PostgREST details', (details, expectedMessage) => {
    const translated = translateReviewOccError({ message: 'review input is invalid', details })
    expect(translated).toBeInstanceOf(UserFacingError)
    expect(translated.message).toBe(expectedMessage)
  })

  it('tells the user what to do when the request disappeared', () => {
    expect(translateReviewOccError({ message: 'review not found' }).message).toBe(REVIEW_NOT_FOUND_MESSAGE)
  })

  it('leaves unrelated errors untouched', () => {
    const original = { message: 'active leader required' }
    expect(translateReviewOccError(original)).toBe(original)
  })
})
