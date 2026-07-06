import type { ReviewStatus } from '../../types'
import type { RepositoryContext } from '../repositoryContext'
import { createLocalReviewRepository } from '../local/localReviewRepository'
import { createSupabaseReviewRepository } from '../remote/supabaseReviewRepository'
import type { ReviewRequestPayload } from '../local/appDataReducers'

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

export async function withdrawReviewRequest(ctx: RepositoryContext, requestId: string): Promise<void> {
  return reviewRepository(ctx).withdrawReviewRequest(requestId)
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

export async function addReviewFeedback(
  ctx: RepositoryContext,
  requestId: string,
  comment: string,
): Promise<void> {
  await reviewRepository(ctx).addReviewFeedback(requestId, comment)
}
