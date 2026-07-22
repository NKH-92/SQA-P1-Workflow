import { makeId } from '../../lib/format'
import type { ReviewRequestPayload } from '../contracts'
import type {
  AppData,
  Profile,
  ReviewEventType,
  ReviewFeedback,
  ReviewRequest,
  ReviewStatus,
} from '../../types'

function appendEvent(
  data: AppData,
  requestId: string,
  profile: Profile,
  eventType: ReviewEventType,
  fromStatus: ReviewStatus | null,
  toStatus: ReviewStatus | null,
  occurredAt: string,
  metadata: Record<string, unknown> = {},
): AppData {
  const nextId = (data.reviewEvents ?? []).reduce((highest, event) => {
    try {
      const candidate = BigInt(event.id)
      return candidate > highest ? candidate : highest
    } catch {
      return highest
    }
  }, 0n) + 1n
  const id = nextId <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(nextId) : nextId.toString()
  return {
    ...data,
    reviewEvents: [
      ...(data.reviewEvents ?? []),
      {
        id,
        review_request_id: requestId,
        actor_id: profile.id,
        actor_name_snapshot: profile.name,
        event_type: eventType,
        from_status: fromStatus,
        to_status: toStatus,
        occurred_at: occurredAt,
        metadata,
        transaction_id: id,
      },
    ],
  }
}

export function createReviewRequest(
  data: AppData,
  profile: Profile,
  reviewId: string,
  payload: ReviewRequestPayload,
): AppData {
  const now = new Date().toISOString()
  const request: ReviewRequest = {
    id: reviewId,
    requester_id: profile.id,
    title: payload.title,
    description: payload.description,
    due_date: payload.due_date,
    status: 'pending',
    review_round: 1,
    rejection_count: 0,
    last_submitted_at: now,
    status_changed_at: now,
    closed_at: null,
    withdrawn_at: null,
    withdrawn_by: null,
    withdrawal_reason: null,
    created_at: now,
    updated_at: now,
    profiles: { name: profile.name, email: profile.email },
    review_feedback: [],
  }
  return appendEvent(
    { ...data, reviewRequests: [request, ...data.reviewRequests] },
    reviewId,
    profile,
    'submitted',
    null,
    'pending',
    now,
    { review_round: 1, estimated: false },
  )
}

export function updateReviewRequest(data: AppData, reviewId: string, payload: ReviewRequestPayload): AppData {
  return {
    ...data,
    reviewRequests: data.reviewRequests.map((request) =>
      request.id === reviewId ? { ...request, ...payload, updated_at: new Date().toISOString() } : request,
    ),
  }
}

export function withdrawReviewRequest(
  data: AppData,
  requestId: string,
  profile: Profile,
  reason: string,
): AppData {
  const now = new Date().toISOString()
  const next = {
    ...data,
    reviewRequests: data.reviewRequests.map((item) =>
      item.id === requestId
        ? {
            ...item,
            status: 'withdrawn' as const,
            status_changed_at: now,
            closed_at: now,
            withdrawn_at: now,
            withdrawn_by: profile.id,
            withdrawal_reason: reason,
            updated_at: now,
          }
        : item,
    ),
  }
  return appendEvent(next, requestId, profile, 'withdrawn', 'pending', 'withdrawn', now, {
    reason_length: reason.length,
    estimated: false,
  })
}

export function rejectReviewRequest(
  data: AppData,
  requestId: string,
  profile: Profile,
  comment: string,
  feedbackId: string,
): AppData {
  const now = new Date().toISOString()
  const item: ReviewFeedback = {
    id: feedbackId,
    review_request_id: requestId,
    leader_id: profile.id,
    author_role: 'leader',
    comment,
    created_at: now,
    updated_at: now,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    profiles: { name: profile.name },
  }
  const next = {
    ...data,
    reviewRequests: data.reviewRequests.map((row) =>
      row.id === requestId
        ? {
            ...row,
            status: 'rejected' as const,
            status_changed_at: now,
            closed_at: now,
            rejection_count: (row.rejection_count ?? 0) + 1,
            updated_at: now,
            review_feedback: [...(row.review_feedback ?? []), item],
          }
        : row,
    ),
  }
  const withFeedback = appendEvent(next, requestId, profile, 'feedback_added', null, null, now, {
    feedback_id: feedbackId,
    estimated: false,
  })
  return appendEvent(withFeedback, requestId, profile, 'rejected', 'pending', 'rejected', now, {
    estimated: false,
  })
}

export function resubmitReviewRequest(
  data: AppData,
  requestId: string,
  profile: Profile,
  comment: string,
  feedbackId: string,
): AppData {
  const now = new Date().toISOString()
  const item: ReviewFeedback = {
    id: feedbackId,
    review_request_id: requestId,
    leader_id: profile.id,
    author_role: 'member',
    comment,
    created_at: now,
    updated_at: now,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    profiles: { name: profile.name },
  }
  const request = data.reviewRequests.find((row) => row.id === requestId)
  const next = {
    ...data,
    reviewRequests: data.reviewRequests.map((row) =>
      row.id === requestId
        ? {
            ...row,
            status: 'pending' as const,
            status_changed_at: now,
            closed_at: null,
            review_round: (row.review_round ?? 1) + 1,
            last_submitted_at: now,
            updated_at: now,
            review_feedback: [...(row.review_feedback ?? []), item],
          }
        : row,
    ),
  }
  return appendEvent(next, requestId, profile, 'resubmitted', 'rejected', 'pending', now, {
    review_round: (request?.review_round ?? 1) + 1,
    estimated: false,
  })
}

export function setReviewStatus(
  data: AppData,
  requestId: string,
  status: ReviewStatus,
  profile: Profile,
): AppData {
  const now = new Date().toISOString()
  const request = data.reviewRequests.find((row) => row.id === requestId)
  const eventType: ReviewEventType = status === 'pending' ? 'reopened' : status
  const next = {
    ...data,
    reviewRequests: data.reviewRequests.map((row) =>
      row.id === requestId
        ? {
            ...row,
            status,
            status_changed_at: now,
            closed_at: status === 'pending' ? null : now,
            updated_at: now,
          }
        : row,
    ),
  }
  return appendEvent(next, requestId, profile, eventType, request?.status ?? null, status, now, {
    estimated: false,
  })
}

export function appendReviewFeedback(
  data: AppData,
  requestId: string,
  feedback: ReviewFeedback,
  profile: Profile,
): AppData {
  const next = {
    ...data,
    reviewRequests: data.reviewRequests.map((row) =>
      row.id === requestId ? { ...row, review_feedback: [...(row.review_feedback ?? []), feedback] } : row,
    ),
  }
  return appendEvent(next, requestId, profile, 'feedback_added', null, null, feedback.created_at ?? new Date().toISOString(), {
    feedback_id: feedback.id,
    estimated: false,
  })
}

export function newId(prefix: string): string {
  return makeId(prefix)
}

export function updateReviewFeedback(
  data: AppData,
  feedbackId: string,
  comment: string,
  profile: Profile,
): AppData {
  const now = new Date().toISOString()
  const feedback = data.reviewRequests.flatMap((row) => row.review_feedback ?? []).find((row) => row.id === feedbackId)
  const next = {
    ...data,
    reviewRequests: data.reviewRequests.map((row) => ({
      ...row,
      review_feedback: row.review_feedback?.map((item) =>
        item.id === feedbackId ? { ...item, comment, updated_at: now } : item,
      ),
    })),
  }
  return feedback
    ? appendEvent(next, feedback.review_request_id, profile, 'feedback_updated', null, null, now, {
        feedback_id: feedbackId,
        estimated: false,
      })
    : next
}

export function voidReviewFeedback(
  data: AppData,
  feedbackId: string,
  profile: Profile,
  reason: string,
): AppData {
  const now = new Date().toISOString()
  const feedback = data.reviewRequests.flatMap((row) => row.review_feedback ?? []).find((row) => row.id === feedbackId)
  const next = {
    ...data,
    reviewRequests: data.reviewRequests.map((row) => ({
      ...row,
      review_feedback: row.review_feedback?.map((item) =>
        item.id === feedbackId
          ? { ...item, voided_at: now, voided_by: profile.id, void_reason: reason, updated_at: now }
          : item,
      ),
    })),
  }
  return feedback
    ? appendEvent(next, feedback.review_request_id, profile, 'feedback_voided', null, null, now, {
        feedback_id: feedbackId,
        reason_length: reason.length,
        estimated: false,
      })
    : next
}
