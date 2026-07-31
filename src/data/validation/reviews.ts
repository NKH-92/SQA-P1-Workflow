import { UserFacingError } from '../../lib/errors'
import { businessDateKey } from '../../lib/businessTime'
import type { Profile, ReviewStatus } from '../../types'
import type { ReviewRequestPayload } from '../contracts'

export const REVIEW_REQUEST_LIMITS = {
  titleMin: 2,
  titleMax: 200,
  descriptionMin: 2,
  descriptionMax: 20_000,
} as const

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
    throw new UserFacingError('제목은 2자 이상 200자 이하로 입력해 주세요.')
  }
  if (
    description.length < REVIEW_REQUEST_LIMITS.descriptionMin
    || description.length > REVIEW_REQUEST_LIMITS.descriptionMax
  ) {
    throw new UserFacingError('설명은 2자 이상 20,000자 이하로 입력해 주세요.')
  }
  if (payload.due_date) {
    if (!isDateOnly(payload.due_date)) throw new UserFacingError('검토 기한 형식이 올바르지 않습니다.')
    const today = businessDateKey(options.now ?? new Date())
    const existing = options.existingDueDate?.slice(0, 10) ?? null
    if (payload.due_date < today && payload.due_date !== existing) {
      throw new UserFacingError('새 검토 기한은 오늘보다 이전으로 지정할 수 없습니다.')
    }
  }
  return { title, description, due_date: payload.due_date }
}

export function assertActiveLeader(profile: Pick<Profile, 'role' | 'is_active'>) {
  if (profile.role !== 'leader' || profile.is_active === false) {
    throw new UserFacingError('활성 파트장 권한이 필요합니다.')
  }
}

export function assertReviewStatusTransition(current: ReviewStatus, next: ReviewStatus) {
  if (current === next) return
  if (current === 'pending' && next === 'approved') return
  if (next === 'rejected') {
    throw new UserFacingError('반려는 전용 동작을 사용해 주세요.')
  }
  throw new UserFacingError('이 상태에서는 더 이상 상태를 변경할 수 없습니다.')
}

export function assertCanReject(current: ReviewStatus) {
  if (current !== 'pending') {
    throw new UserFacingError('대기중인 검토요청만 반려할 수 있습니다.')
  }
}
export function assertCanReopen(current: ReviewStatus) {
  if (current !== 'approved' && current !== 'rejected') {
    throw new UserFacingError('종결된 검토요청만 다시 열 수 있습니다.')
  }
}

export function assertCanResubmit(current: ReviewStatus) {
  if (current !== 'rejected') {
    throw new UserFacingError('반려된 검토요청만 재요청할 수 있습니다.')
  }
}

export function assertActiveMember(profile: Pick<Profile, 'role' | 'is_active'>) {
  if (profile.role !== 'member' || profile.is_active === false) {
    throw new UserFacingError('활성 파트원 권한이 필요합니다.')
  }
}

export function assertFeedbackComment(comment: string) {
  if (!comment.trim()) {
    throw new UserFacingError('피드백을 입력해 주세요.')
  }
  if (comment.trim().length > 2000) {
    throw new UserFacingError('피드백은 2000자 이내로 입력해 주세요.')
  }
}
