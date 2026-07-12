import { isStorageAttachment } from '../../lib/attachments'
import { UserFacingError } from '../../lib/errors'
import type { Profile, ReviewStatus } from '../../types'

export function assertActiveLeader(profile: Pick<Profile, 'role' | 'is_active'>) {
  if (profile.role !== 'leader' || profile.is_active === false) {
    throw new UserFacingError('활성 파트장 권한이 필요합니다.')
  }
}

export function assertStorageAttachmentOnly(value: string | null | undefined) {
  if (!value || !value.trim()) return null
  if (!isStorageAttachment(value)) {
    throw new UserFacingError('첨부는 파일 업로드만 사용할 수 있습니다.')
  }
  return value
}

export function assertReviewStatusTransition(current: ReviewStatus, next: ReviewStatus) {
  if (current === next) return
  if (current === 'pending' && next === 'approved') return
  if (next === 'rejected') {
    throw new UserFacingError('반려는 피드백과 함께 처리해야 합니다.')
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

export function assertFeedbackComment(comment: string) {
  if (!comment.trim()) {
    throw new UserFacingError('피드백을 입력해 주세요.')
  }
  if (comment.trim().length > 2000) {
    throw new UserFacingError('피드백은 2000자 이내로 입력해 주세요.')
  }
}
