import { validateStorageAttachmentOwnership } from '../../lib/attachments'
import { recordActivityLog } from '../../lib/activityLog'
import { UserFacingError } from '../../lib/errors'
import { reviewStatusLabels } from '../../lib/format'
import {
  assertCanReject,
  assertReviewStatusTransition,
  assertStorageAttachmentOnly,
} from '../../features/reviews/review.validators'
import type { ReviewFeedback, ReviewStatus } from '../../types'
import type { LocalRepositoryContext, ReviewRepository } from '../repositories/types'
import {
  appendReviewFeedback,
  createReviewRequest,
  newId,
  rejectReviewRequest as rejectReviewRequestReducer,
  removeReviewRequest,
  setReviewStatus,
  updateReviewRequest,
} from './appDataReducers'

export function createLocalReviewRepository(ctx: LocalRepositoryContext): ReviewRepository {
  const { profile, data, setData } = ctx

  return {
    async saveReviewRequest({ editingReviewId, payload }) {
      const { title, due_date: dueDate } = payload
      assertStorageAttachmentOnly(payload.attachment_url)
      const attachmentError = validateStorageAttachmentOwnership(profile.id, payload.attachment_url)
      if (attachmentError) throw new UserFacingError(attachmentError)

      if (editingReviewId) {
        setData((current) => updateReviewRequest(current, editingReviewId, payload))
        await recordActivityLog(setData, {
          actor: profile,
          entityType: 'review_request',
          entityId: editingReviewId,
          action: 'updated',
          summary: `${profile.name}님이 ${title} 검토요청을 수정했습니다.`,
          metadata: { due_date: dueDate },
        })
        return { reviewId: editingReviewId, isUpdate: true }
      }

      const reviewId = newId('review')
      setData((current) => createReviewRequest(current, profile, reviewId, payload))
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'review_request',
        entityId: reviewId,
        action: 'created',
        summary: `${profile.name}님이 ${title} 검토를 요청했습니다.`,
        metadata: { due_date: dueDate },
      })
      return { reviewId, isUpdate: false }
    },

    async withdrawReviewRequest(requestId) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) return
      setData((current) => removeReviewRequest(current, requestId))
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'review_request',
        entityId: requestId,
        action: 'withdrawn',
        summary: `${profile.name}님이 ${request.title} 검토요청을 회수했습니다.`,
      })
    },

    async rejectReviewRequest(requestId, comment) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError('검토요청을 찾을 수 없습니다.')
      assertCanReject(request.status)
      const feedbackId = newId('feedback')
      setData((current) => rejectReviewRequestReducer(current, requestId, profile, comment, feedbackId))
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: request?.requester_id ?? null,
        entityType: 'review_request',
        entityId: requestId,
        action: 'status_changed',
        summary: `${request?.title ?? '검토요청'}을 반려했습니다.`,
        metadata: { status: 'rejected' },
      })
    },

    async updateReviewStatus(requestId, status) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError('검토요청을 찾을 수 없습니다.')
      assertReviewStatusTransition(request.status, status)
      setData((current) => setReviewStatus(current, requestId, status))
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: request?.requester_id ?? null,
        entityType: 'review_request',
        entityId: requestId,
        action: 'status_changed',
        summary: `${request?.title ?? '검토요청'} 상태를 ${reviewStatusLabels[status]}로 변경했습니다.`,
        metadata: { status },
      })
    },

    async addReviewFeedback(requestId, comment) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      const feedbackId = newId('feedback')
      const item: ReviewFeedback = {
        id: feedbackId,
        review_request_id: requestId,
        leader_id: profile.id,
        comment,
        created_at: new Date().toISOString(),
        profiles: { name: profile.name },
      }
      setData((current) => appendReviewFeedback(current, requestId, item))
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: request?.requester_id ?? null,
        entityType: 'review_feedback',
        entityId: feedbackId,
        action: 'created',
        summary: `${request?.title ?? '검토요청'}에 피드백을 남겼습니다.`,
        metadata: { review_request_id: requestId },
      })
      return feedbackId
    },
  }
}

export type { ReviewStatus }
