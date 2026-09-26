import { UserFacingError } from '../../lib/errors'
import type { ReviewRequest, ReviewStatus } from '../../types'
import type { ReviewRequestPayload } from '../contracts'
import type { RepositoryContext } from '../repositoryContext'
import {
  assertCanResubmit,
  assertResubmitNote,
  normalizeReviewRequestPayload,
} from '../validation/reviews'

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

function hasReviewContentChanged(request: ReviewRequest, payload: ReviewRequestPayload) {
  return (
    request.title.trim() !== payload.title
    || request.description.trim() !== payload.description
    || (request.due_date?.slice(0, 10) ?? null) !== (payload.due_date ?? null)
  )
}

/**
 * ‘고쳐서 다시 요청하기’: 반려된 요청의 내용을 고치고 같은 요청으로 다시 보낸다.
 * - 두 번째 쓰기가 입력 오류로 실패해 수정만 반영되는 일이 없도록, 쓰기 전에 모든 입력을 먼저 검사한다.
 * - 내용이 그대로면 수정 기록을 남기지 않고 재요청만 보낸다.
 * - 원격 저장소는 방금 받은 새 버전으로 재요청의 낙관적 잠금을 통과해야 하므로 같은 저장소 인스턴스를 쓴다.
 */
export async function resubmitReviewRequestWithEdits(
  ctx: RepositoryContext,
  requestId: string,
  payload: ReviewRequestPayload,
  comment: string,
): Promise<{ edited: boolean }> {
  const request = ctx.data.reviewRequests.find((item) => item.id === requestId)
  if (!request) throw new UserFacingError('검토요청을 찾지 못했어요. 목록을 새로고침해 주세요.')
  assertCanResubmit(request.status)
  assertResubmitNote(comment)
  const normalized = normalizeReviewRequestPayload(payload, { existingDueDate: request.due_date })
  const reviews = ctx.repositories.reviews
  const edited = hasReviewContentChanged(request, normalized)
  if (edited) {
    await reviews.saveReviewRequest({ editingReviewId: requestId, payload: normalized })
  }
  await reviews.resubmitReviewRequest(requestId, comment)
  return { edited }
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
