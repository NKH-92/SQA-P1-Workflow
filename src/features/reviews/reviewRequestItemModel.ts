import { dueUrgency } from '../../lib/dates'
import { reviewStatusLabels } from '../../lib/format'
import type { Profile, ReviewRequest, ReviewStatus } from '../../types'

export type TimelineStepState = 'complete' | 'current' | 'waiting'

function timelineStepState(index: number, status: ReviewStatus): TimelineStepState {
  if (status === 'pending') return index === 0 ? 'current' : 'waiting'
  if (status === 'approved') return 'complete'
  return index === 0 ? 'complete' : 'current'
}

function timelineSteps(status: ReviewStatus) {
  return [
    { key: 'pending', label: reviewStatusLabels.pending },
    {
      key: 'outcome',
      label: status === 'rejected'
        ? reviewStatusLabels.rejected
        : status === 'withdrawn'
          ? reviewStatusLabels.withdrawn
          : reviewStatusLabels.approved,
    },
  ].map((step, index) => ({ ...step, state: timelineStepState(index, status) }))
}

export function buildReviewRequestItemModel(request: ReviewRequest, profile: Profile) {
  const ownsRequest = profile.id === request.requester_id
  const reviewRound = request.review_round ?? 1
  const rejectionCount = request.rejection_count ?? (request.status === 'rejected' ? 1 : 0)
  const urgency = dueUrgency(request.due_date)

  return {
    timelineSteps: timelineSteps(request.status),
    requestFeedback: request.review_feedback ?? [],
    ownsRequest,
    canEditOwn: ownsRequest && (request.status === 'pending' || request.status === 'rejected'),
    canWithdrawOwn: ownsRequest && request.status === 'pending',
    isMemberResubmission: profile.role === 'member' && ownsRequest && request.status === 'rejected',
    reviewRound,
    rejectionCount,
    statusLabel: request.status === 'pending' && reviewRound > 1
      ? '재검토 요청'
      : reviewStatusLabels[request.status],
    urgency,
    dueUrgent: urgency === 'urgent',
  }
}
