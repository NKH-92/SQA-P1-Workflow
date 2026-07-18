import type { ReviewStatus } from '../../types'
import type { ReviewRequestPayload } from '../contracts'
import type { RepositoryContext } from '../repositoryContext'
import { createLocalReviewRepository } from '../local/localReviewRepository'
import { createSupabaseReviewRepository } from '../remote/supabaseReviewRepository'

export type { ReviewRequestPayload }

function reviewRepository(ctx: RepositoryContext) {
  return ctx.isRemote ? createSupabaseReviewRepository(ctx) : createLocalReviewRepository(ctx)
}

export async function saveReviewRequest(
  ctx: RepositoryContext,
  input: {
    editingReviewId: string | null
    payload: ReviewRequestPayload
  },
) {
  return reviewRepository(ctx).saveReviewRequest(input)
}

export async function withdrawReviewRequest(ctx: RepositoryContext, requestId: string, reason: string): Promise<void> {
  return reviewRepository(ctx).withdrawReviewRequest(requestId, reason)
}

export async function rejectReviewRequest(
  ctx: RepositoryContext,
  requestId: string,
  comment: string,
): Promise<void> {
  return reviewRepository(ctx).rejectReviewRequest(requestId, comment)
}

export async function updateReviewStatus(
  ctx: RepositoryContext,
  requestId: string,
  status: ReviewStatus,
): Promise<void> {
  return reviewRepository(ctx).updateReviewStatus(requestId, status)
}

export async function reopenReviewRequest(ctx: RepositoryContext, requestId: string): Promise<void> {
  return reviewRepository(ctx).reopenReviewRequest(requestId)
}

export async function resubmitReviewRequest(
  ctx: RepositoryContext,
  requestId: string,
  comment: string,
): Promise<void> {
  return reviewRepository(ctx).resubmitReviewRequest(requestId, comment)
}

export async function addReviewFeedback(
  ctx: RepositoryContext,
  requestId: string,
  comment: string,
): Promise<void> {
  await reviewRepository(ctx).addReviewFeedback(requestId, comment)
}

export async function updateReviewFeedback(
  ctx: RepositoryContext,
  feedbackId: string,
  comment: string,
): Promise<void> {
  return reviewRepository(ctx).updateReviewFeedback(feedbackId, comment)
}

export async function voidReviewFeedback(ctx: RepositoryContext, feedbackId: string, reason: string): Promise<void> {
  return reviewRepository(ctx).voidReviewFeedback(feedbackId, reason)
}

export async function markReviewSeen(ctx: RepositoryContext, requestId: string): Promise<void> {
  return reviewRepository(ctx).markReviewSeen(requestId)
}

export async function markAllRelevantReviewsSeen(ctx: RepositoryContext): Promise<void> {
  return reviewRepository(ctx).markAllRelevantReviewsSeen()
}
