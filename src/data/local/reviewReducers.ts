import { makeId } from '../../lib/format'
import type { ReviewRequestPayload } from '../contracts'
import type {
  AppData,
  Profile,
  ReviewFeedback,
  ReviewRequest,
  ReviewStatus,
} from '../../types'

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
    attachment_url: payload.attachment_url,
    due_date: payload.due_date,
    status: 'pending',
    review_round: 1,
    rejection_count: 0,
    last_submitted_at: now,
    created_at: now,
    updated_at: now,
    profiles: { name: profile.name, email: profile.email },
    review_feedback: [],
  }
  return { ...data, reviewRequests: [request, ...data.reviewRequests] }
}

export function updateReviewRequest(
  data: AppData,
  reviewId: string,
  payload: ReviewRequestPayload,
): AppData {
  return {
    ...data,
    reviewRequests: data.reviewRequests.map((request) =>
      request.id === reviewId
        ? { ...request, ...payload, updated_at: new Date().toISOString() }
        : request,
    ),
  }
}

export function removeReviewRequest(data: AppData, requestId: string): AppData {
  return {
    ...data,
    reviewRequests: data.reviewRequests.filter((item) => item.id !== requestId),
  }
}

export function rejectReviewRequest(
  data: AppData,
  requestId: string,
  profile: Profile,
  comment: string,
  feedbackId: string,
): AppData {
  const item: ReviewFeedback = {
    id: feedbackId,
    review_request_id: requestId,
    leader_id: profile.id,
    author_role: 'leader',
    comment,
    created_at: new Date().toISOString(),
    profiles: { name: profile.name },
  }
  return {
    ...data,
    reviewRequests: data.reviewRequests.map((row) =>
      row.id === requestId
        ? {
            ...row,
            status: 'rejected',
            rejection_count: (row.rejection_count ?? 0) + 1,
            // Match the remote trigger so demo processing-time stats aren't computed as 0 days.
            updated_at: new Date().toISOString(),
            review_feedback: [...(row.review_feedback ?? []), item],
          }
        : row,
    ),
  }
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
    profiles: { name: profile.name },
  }
  return {
    ...data,
    reviewRequests: data.reviewRequests.map((row) =>
      row.id === requestId
        ? {
            ...row,
            status: 'pending',
            review_round: (row.review_round ?? 1) + 1,
            last_submitted_at: now,
            updated_at: now,
            review_feedback: [...(row.review_feedback ?? []), item],
          }
        : row,
    ),
  }
}

export function setReviewStatus(data: AppData, requestId: string, status: ReviewStatus): AppData {
  return {
    ...data,
    reviewRequests: data.reviewRequests.map((row) =>
      row.id === requestId ? { ...row, status, updated_at: new Date().toISOString() } : row,
    ),
  }
}

export function appendReviewFeedback(
  data: AppData,
  requestId: string,
  feedback: ReviewFeedback,
): AppData {
  return {
    ...data,
    reviewRequests: data.reviewRequests.map((row) =>
      row.id === requestId
        ? { ...row, review_feedback: [...(row.review_feedback ?? []), feedback] }
        : row,
    ),
  }
}

export function newId(prefix: string): string {
  return makeId(prefix)
}

export function updateReviewFeedback(data: AppData, feedbackId: string, comment: string): AppData {
  return {
    ...data,
    reviewRequests: data.reviewRequests.map((row) => ({
      ...row,
      review_feedback: row.review_feedback?.map((feedback) =>
        feedback.id === feedbackId ? { ...feedback, comment } : feedback,
      ),
    })),
  }
}

export function removeReviewFeedback(data: AppData, feedbackId: string): AppData {
  return {
    ...data,
    reviewRequests: data.reviewRequests.map((row) => ({
      ...row,
      review_feedback: row.review_feedback?.filter((feedback) => feedback.id !== feedbackId),
    })),
  }
}
