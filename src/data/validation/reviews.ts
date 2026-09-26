import { UserFacingError } from '../../lib/errors'
import { businessDateKey } from '../../lib/businessTime'
import type { Profile, ReviewStatus } from '../../types'
import type { ReviewRequestPayload } from '../contracts'

export const REVIEW_REQUEST_LIMITS = {
  titleMin: 2,
  titleMax: 200,
  descriptionMin: 2,
  descriptionMax: 20_000,
  /** 피드백·반려 사유·재요청 내용의 최대 길이 */
  commentMax: 2_000,
  /** 재요청 내용 최소 길이(서버 resubmit_review_request와 같은 기준) */
  resubmitNoteMin: 2,
} as const

export const REVIEW_TITLE_LENGTH_MESSAGE = '제목은 2~200자로 입력해 주세요.'
export const REVIEW_DESCRIPTION_LENGTH_MESSAGE = '설명은 2~20,000자로 입력해 주세요.'
export const REVIEW_DUE_DATE_PAST_MESSAGE = '기한은 오늘이나 그 이후 날짜로 골라 주세요.'
export const REJECT_REASON_REQUIRED_MESSAGE = '반려 사유를 적어 주세요.'
export const REJECT_REASON_TOO_LONG_MESSAGE = '반려 사유는 2,000자 이하로 입력해 주세요.'
export const RESUBMIT_NOTE_REQUIRED_MESSAGE = '재요청 내용을 2자 이상 적어 주세요.'
export const RESUBMIT_NOTE_TOO_LONG_MESSAGE = '재요청 내용은 2,000자 이하로 입력해 주세요.'

function isDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function normalizeReviewRequestPayload(
  payload: ReviewRequestPayload,
  options: { existingDueDate?: string | null; now?: Date } = {},
): ReviewRequestPayload {
  const title = payload.title.trim()
  const description = payload.description.trim()
  if (title.length < REVIEW_REQUEST_LIMITS.titleMin || title.length > REVIEW_REQUEST_LIMITS.titleMax) {
    throw new UserFacingError(REVIEW_TITLE_LENGTH_MESSAGE)
  }
  if (
    description.length < REVIEW_REQUEST_LIMITS.descriptionMin
    || description.length > REVIEW_REQUEST_LIMITS.descriptionMax
  ) {
    throw new UserFacingError(REVIEW_DESCRIPTION_LENGTH_MESSAGE)
  }
  if (payload.due_date) {
    if (!isDateOnly(payload.due_date)) throw new UserFacingError('기한 날짜를 다시 골라 주세요.')
    const today = businessDateKey(options.now ?? new Date())
    const existing = options.existingDueDate?.slice(0, 10) ?? null
    if (payload.due_date < today && payload.due_date !== existing) {
      throw new UserFacingError(REVIEW_DUE_DATE_PAST_MESSAGE)
    }
  }
  return { title, description, due_date: payload.due_date }
}

export function assertActiveLeader(profile: Pick<Profile, 'role' | 'is_active'>) {
  if (profile.role !== 'leader' || profile.is_active === false) {
    throw new UserFacingError('파트장만 할 수 있는 작업이에요.')
  }
}

export function assertReviewStatusTransition(current: ReviewStatus, next: ReviewStatus) {
  if (current === next) return
  if (current === 'pending' && next === 'approved') return
  if (next === 'rejected') {
    throw new UserFacingError('반려는 반려하기 버튼으로 해 주세요.')
  }
  throw new UserFacingError('이미 처리한 요청이에요. 목록을 새로고침해 주세요.')
}

export function assertCanReject(current: ReviewStatus) {
  if (current !== 'pending') {
    throw new UserFacingError('대기 중인 검토요청만 반려할 수 있어요. 목록을 새로고침해 주세요.')
  }
}

export function assertCanReopen(current: ReviewStatus) {
  if (current !== 'approved' && current !== 'rejected') {
    throw new UserFacingError('승인하거나 반려한 검토요청만 다시 열 수 있어요.')
  }
}

export function assertCanResubmit(current: ReviewStatus) {
  if (current !== 'rejected') {
    throw new UserFacingError('반려된 검토요청만 다시 요청할 수 있어요.')
  }
}

export function assertActiveMember(profile: Pick<Profile, 'role' | 'is_active'>) {
  if (profile.role !== 'member' || profile.is_active === false) {
    throw new UserFacingError('파트원만 할 수 있는 작업이에요.')
  }
}

export function assertFeedbackComment(comment: string) {
  if (!comment.trim()) {
    throw new UserFacingError('피드백을 입력해 주세요.')
  }
  if (comment.trim().length > REVIEW_REQUEST_LIMITS.commentMax) {
    throw new UserFacingError('피드백은 2,000자 이하로 입력해 주세요.')
  }
}

/** 반려 사유 검사 결과. 사유는 비어 있으면 안 된다(요청자가 무엇을 고칠지 알아야 한다). */
export function rejectReasonError(comment: string): string | null {
  const trimmed = comment.trim()
  if (!trimmed) return REJECT_REASON_REQUIRED_MESSAGE
  if (trimmed.length > REVIEW_REQUEST_LIMITS.commentMax) return REJECT_REASON_TOO_LONG_MESSAGE
  return null
}

export function assertRejectReason(comment: string) {
  const error = rejectReasonError(comment)
  if (error) throw new UserFacingError(error)
}

/** 재요청 내용 검사 결과. 서버는 2자 이상을 요구한다. */
export function resubmitNoteError(comment: string): string | null {
  const trimmed = comment.trim()
  if (trimmed.length < REVIEW_REQUEST_LIMITS.resubmitNoteMin) return RESUBMIT_NOTE_REQUIRED_MESSAGE
  if (trimmed.length > REVIEW_REQUEST_LIMITS.commentMax) return RESUBMIT_NOTE_TOO_LONG_MESSAGE
  return null
}

export function assertResubmitNote(comment: string) {
  const error = resubmitNoteError(comment)
  if (error) throw new UserFacingError(error)
}
