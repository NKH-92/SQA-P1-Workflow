import { dueState, type DueState } from '../../lib/dates'
import { formatMonthDay } from '../../lib/format'
import type { Profile, ReviewFeedback, ReviewRequest } from '../../types'
import { reviewStatusText } from './reviewOrdering'

/** 상세 위쪽의 한 줄 진행 기록(요청 → 재요청 → 승인·반려·회수). */
export type ReviewProgressStep = {
  key: 'requested' | 'resubmitted' | 'approved' | 'rejected' | 'withdrawn'
  label: string
  at: string | null
}

function stepLabel(at: string | null | undefined, action: string) {
  const day = formatMonthDay(at)
  return day ? `${day} ${action}` : action
}

export function buildReviewProgressSteps(request: ReviewRequest): ReviewProgressStep[] {
  const steps: ReviewProgressStep[] = [
    { key: 'requested', label: stepLabel(request.created_at, '요청'), at: request.created_at ?? null },
  ]
  if ((request.review_round ?? 1) > 1) {
    steps.push({
      key: 'resubmitted',
      label: stepLabel(request.last_submitted_at, '재요청'),
      at: request.last_submitted_at ?? null,
    })
  }
  if (request.status === 'approved' || request.status === 'rejected') {
    const at = request.closed_at ?? request.status_changed_at ?? null
    steps.push({
      key: request.status,
      label: stepLabel(at, request.status === 'approved' ? '승인' : '반려'),
      at,
    })
  }
  if (request.status === 'withdrawn') {
    const at = request.withdrawn_at ?? request.closed_at ?? null
    steps.push({ key: 'withdrawn', label: stepLabel(at, '회수'), at })
  }
  return steps
}

/** 반려 사유로 쓰인 가장 최근 파트장 피드백(무효화한 것 제외). */
export function latestLeaderFeedback(request: ReviewRequest): ReviewFeedback | null {
  const feedback = request.review_feedback ?? []
  for (let index = feedback.length - 1; index >= 0; index -= 1) {
    const item = feedback[index]
    if ((item.author_role ?? 'leader') === 'leader' && !item.voided_at) return item
  }
  return null
}

export function buildReviewRequestItemModel(request: ReviewRequest, profile: Profile, now = new Date()) {
  const ownsRequest = profile.id === request.requester_id
  const isMember = profile.role === 'member'
  const isLeader = profile.role === 'leader'
  const reviewRound = request.review_round ?? 1
  const rejectionCount = request.rejection_count ?? (request.status === 'rejected' ? 1 : 0)
  const due: DueState = dueState(request.due_date, { done: request.status !== 'pending', now })

  return {
    progressSteps: buildReviewProgressSteps(request),
    requestFeedback: request.review_feedback ?? [],
    ownsRequest,
    canEditOwn: isMember && ownsRequest && request.status === 'pending',
    canWithdrawOwn: isMember && ownsRequest && request.status === 'pending',
    /** 반려된 내 요청: 내용을 고쳐 같은 요청으로 다시 보낸다. */
    canResubmitOwn: isMember && ownsRequest && request.status === 'rejected',
    canDecide: isLeader && request.status === 'pending',
    canReopen: isLeader && (request.status === 'approved' || request.status === 'rejected'),
    canLeaveFeedback: isLeader,
    reviewRound,
    rejectionCount,
    /** 지금 반려 상태인 첫 반려는 배지가 이미 말해 주므로 따로 세지 않는다. */
    showRejectionCount: rejectionCount > 1 || (rejectionCount > 0 && request.status !== 'rejected'),
    statusLabel: reviewStatusText(request),
    due,
    /** 대기 중인 요청만 기한 칩을 보여준다(끝난 요청에는 기한 경과를 보여주지 않는다). */
    dueChip: request.status === 'pending' && due.kind !== 'none' ? due : null,
  }
}
