import { UserFacingError } from '../../lib/errors'

/** User-facing message for review OCC conflicts (`SQA_REVIEW_CONFLICT`). */
export const REVIEW_STALE_MESSAGE =
  '다른 사용자가 변경했습니다. 새로고침 후 다시 시도해 주세요.'

/**
 * Translate stable review RPC conflict text into the same Korean stale message
 * used by master OCC, so R-E2E-06 / mutation toasts stay user-facing.
 */
export function translateReviewOccError<T extends { message?: string }>(error: T): T | UserFacingError {
  const message = error.message ?? ''
  if (message.includes('review changed since it was opened')) {
    return new UserFacingError(REVIEW_STALE_MESSAGE)
  }
  if (message.includes('review not found')) {
    return new UserFacingError('검토요청을 찾을 수 없습니다.')
  }
  if (message.includes('review is not pending')) {
    return new UserFacingError('이미 처리된 검토요청입니다. 목록을 새로고침해 주세요.')
  }
  return error
}
