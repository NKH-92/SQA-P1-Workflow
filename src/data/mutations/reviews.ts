import type { ReviewStatus } from '../../types'
import type { ReviewRequestPayload } from '../contracts'
import type { RepositoryContext } from '../repositoryContext'

export type { ReviewRequestPayload }

export async function saveReviewRequest(
  ctx: RepositoryContext,
  input: {
    editingReviewId: string | null
    payload: ReviewRequestPayload
  },
) {
  return ctx.repositories.reviews.saveReviewRequest(input)
}

export async function withdrawReviewRequest(ctx: RepositoryContext, requestId: string, reason: string): Promise<void> {
  return ctx.repositories.reviews.withdrawReviewRequest(requestId, reason)
}

export async function rejectReviewRequest(
  ctx: RepositoryContext,
  requestId: string,
  comment: string,
): Promise<void> {
  return ctx.repositories.reviews.rejectReviewRequest(requestId, comment)
}

export async function updateReviewStatus(
  ctx: RepositoryContext,
  requestId: string,
  status: ReviewStatus,
): Promise<void> {
  return ctx.repositories.reviews.updateReviewStatus(requestId, status)
}

export async function reopenReviewRequest(ctx: RepositoryContext, requestId: string): Promise<void> {
  return ctx.repositories.reviews.reopenReviewRequest(requestId)
}

export async function resubmitReviewRequest(
  ctx: RepositoryContext,
  requestId: string,
  comment: string,
): Promise<void> {
  return ctx.repositories.reviews.resubmitReviewRequest(requestId, comment)
}

export async function addReviewFeedback(
  ctx: RepositoryContext,
  requestId: string,
  comment: string,
): Promise<void> {
  await ctx.repositories.reviews.addReviewFeedback(requestId, comment)
}

export async function updateReviewFeedback(
  ctx: RepositoryContext,
  feedbackId: string,
  comment: string,
): Promise<void> {
  return ctx.repositories.reviews.updateReviewFeedback(feedbackId, comment)
}

export async function voidReviewFeedback(ctx: RepositoryContext, feedbackId: string, reason: string): Promise<void> {
  return ctx.repositories.reviews.voidReviewFeedback(feedbackId, reason)
}

export async function markReviewSeen(ctx: RepositoryContext, requestId: string): Promise<void> {
  return ctx.repositories.reviews.markReviewSeen(requestId)
}

export async function markAllRelevantReviewsSeen(ctx: RepositoryContext): Promise<void> {
  return ctx.repositories.reviews.markAllRelevantReviewsSeen()
}
