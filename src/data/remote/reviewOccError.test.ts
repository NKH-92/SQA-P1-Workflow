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

  // 최신 정의(20260718054124_harden_review_workflow 등)가 올리는 상태 전이 오류의 실제 모양
  it.each([
    ['review is not editable', 'SQA_REVIEW_NOT_EDITABLE', '이미 처리한 요청이라 수정할 수 없어요. 목록을 새로고침해 주세요.'],
    ['only pending reviews can be withdrawn', 'SQA_REVIEW_NOT_WITHDRAWABLE', '이미 처리한 요청이라 회수할 수 없어요. 목록을 새로고침해 주세요.'],
    ['only rejected reviews can be resubmitted', 'SQA_REVIEW_NOT_RESUBMITTABLE', '이미 처리한 검토요청이에요. 목록을 새로고침해 주세요.'],
    ['review cannot be reopened', 'SQA_REVIEW_NOT_REOPENABLE', '이미 처리한 검토요청이에요. 목록을 새로고침해 주세요.'],
    ['review is not pending', 'SQA_REVIEW_NOT_PENDING', '이미 처리한 검토요청이에요. 목록을 새로고침해 주세요.'],
    ['review changed since it was opened', 'SQA_REVIEW_CONFLICT', REVIEW_STALE_MESSAGE],
    ['review not found', 'SQA_REVIEW_NOT_FOUND', REVIEW_NOT_FOUND_MESSAGE],
    ['feedback changed since it was opened', 'SQA_FEEDBACK_CONFLICT', REVIEW_STALE_MESSAGE],
    ['feedback not found', 'SQA_FEEDBACK_NOT_FOUND', '피드백을 찾지 못했어요. 목록을 새로고침해 주세요.'],
    ['voided feedback cannot be edited', 'SQA_FEEDBACK_VOIDED', '이미 무효화한 피드백이에요.'],
    ['feedback already voided', 'SQA_FEEDBACK_VOIDED', '이미 무효화한 피드백이에요.'],
  ])('maps the server state error "%s" (%s) to a refresh guidance', (message, details, expected) => {
    const translated = translateReviewOccError({ code: 'P0001', details, hint: null, message })
    expect(translated).toBeInstanceOf(UserFacingError)
    expect(translated.message).toBe(expected)
  })

  it('maps a state code even when only the details marker is stable', () => {
    const translated = translateReviewOccError({ message: 'request rejected', details: 'SQA_REVIEW_NOT_WITHDRAWABLE' })
    expect(translated.message).toBe('이미 처리한 요청이라 회수할 수 없어요. 목록을 새로고침해 주세요.')
  })

  it('leaves unrelated errors untouched', () => {
    const original = { message: 'active leader required' }
    expect(translateReviewOccError(original)).toBe(original)
  })
})
