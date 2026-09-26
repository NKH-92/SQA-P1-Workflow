import { UserFacingError } from '../../lib/errors'
import {
  RESUBMIT_NOTE_REQUIRED_MESSAGE,
  REVIEW_DESCRIPTION_LENGTH_MESSAGE,
  REVIEW_DUE_DATE_PAST_MESSAGE,
  REVIEW_TITLE_LENGTH_MESSAGE,
} from '../validation/reviews'

/** User-facing message for review OCC conflicts (`SQA_REVIEW_CONFLICT`). */
export const REVIEW_STALE_MESSAGE =
  '다른 사람이 먼저 수정했어요. 새로고침한 뒤 다시 시도해 주세요.'

export const REVIEW_NOT_FOUND_MESSAGE = '검토요청을 찾지 못했어요. 목록을 새로고침해 주세요.'

/**
 * Translate stable review RPC conflict text into the same Korean stale message
 * used by master OCC, so R-E2E-06 / mutation toasts stay user-facing.
 * 입력 검증 문구는 클라이언트 검증(validation/reviews)과 같은 문장을 쓴다.
 */
export function translateReviewOccError<
  T extends { message?: string; details?: string; detail?: string },
>(error: T): T | UserFacingError {
  const message = error.message ?? ''
  const marker = `${message} ${error.details ?? ''} ${error.detail ?? ''}`
  if (marker.includes('SQA_REVIEW_TITLE_INVALID')) {
    return new UserFacingError(REVIEW_TITLE_LENGTH_MESSAGE)
  }
  if (marker.includes('SQA_REVIEW_DESCRIPTION_INVALID')) {
    return new UserFacingError(REVIEW_DESCRIPTION_LENGTH_MESSAGE)
  }
  if (marker.includes('SQA_REVIEW_DUE_DATE_PAST')) {
    return new UserFacingError(REVIEW_DUE_DATE_PAST_MESSAGE)
  }
  if (marker.includes('SQA_REVIEW_COMMENT_REQUIRED')) {
    return new UserFacingError(RESUBMIT_NOTE_REQUIRED_MESSAGE)
  }
  if (message.includes('review changed since it was opened')) {
    return new UserFacingError(REVIEW_STALE_MESSAGE)
  }
  if (message.includes('review not found')) {
    return new UserFacingError(REVIEW_NOT_FOUND_MESSAGE)
  }
  if (message.includes('review is not pending')) {
    return new UserFacingError('이미 처리한 검토요청이에요. 목록을 새로고침해 주세요.')
  }
  return error
}
