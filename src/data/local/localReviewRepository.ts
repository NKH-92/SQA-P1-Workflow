import { validateStorageAttachmentOwnership } from '../../lib/attachments'
import { recordActivityLog } from '../../lib/activityLog'
import { UserFacingError } from '../../lib/errors'
import { reviewStatusLabels } from '../../lib/format'
import {
  assertCanReject,
  assertCanReopen,
  assertCanResubmit,
  assertActiveLeader,
  assertActiveMember,
  assertFeedbackComment,
  assertReviewStatusTransition,
  assertStorageAttachmentOnly,
} from '../../features/reviews/review.validators'
import type { ReviewFeedback } from '../../types'
import type { RepositoryDeps, ReviewRepository } from '../repositories/types'
import {
  appendReviewFeedback,
  createReviewRequest,
  newId,
  rejectReviewRequest as rejectReviewRequestReducer,
  resubmitReviewRequest as resubmitReviewRequestReducer,
  removeReviewFeedback,
  removeReviewRequest,
  setReviewStatus,
  updateReviewFeedback,
  updateReviewRequest,
} from './appDataReducers'

export function createLocalReviewRepository(ctx: RepositoryDeps): ReviewRepository {
  const { profile, data, setData } = ctx

  return {
    async saveReviewRequest({ editingReviewId, payload }) {
      const { title, due_date: dueDate } = payload
      assertStorageAttachmentOnly(payload.attachment_url)
      const attachmentError = validateStorageAttachmentOwnership(profile.id, payload.attachment_url)
      if (attachmentError) throw new UserFacingError(attachmentError)

      if (editingReviewId) {
        // Parity with remote RLS: a requester may correct a pending or rejected request.
        const target = data.reviewRequests.find((item) => item.id === editingReviewId)
        if (!target) {
          throw new UserFacingError('검토요청을 찾을 수 없습니다.')
        }
        if (target.status !== 'pending' && target.status !== 'rejected') {
          throw new UserFacingError('완료된 요청은 수정할 수 없습니다. 목록을 새로고침해 주세요.')
        }
        if (target.requester_id !== profile.id) {
          throw new UserFacingError('본인의 요청만 수정할 수 있습니다.')
        }
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
      if (!request) {
        throw new UserFacingError('검토요청을 찾을 수 없습니다.')
      }
      if (request.status !== 'pending') {
        throw new UserFacingError('이미 처리된 요청이라 회수할 수 없습니다. 목록을 새로고침해 주세요.')
      }
      if (request.requester_id !== profile.id) {
        throw new UserFacingError('본인의 요청만 회수할 수 있습니다.')
      }
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
      assertActiveLeader(profile)
      assertFeedbackComment(comment)
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError('검토요청을 찾을 수 없습니다.')
      assertCanReject(request.status)
      const feedbackId = newId('feedback')
      setData((current) => rejectReviewRequestReducer(current, requestId, profile, comment.trim(), feedbackId))
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
      assertActiveLeader(profile)
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

    async reopenReviewRequest(requestId) {
      assertActiveLeader(profile)
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError('검토요청을 찾을 수 없습니다.')
      assertCanReopen(request.status)
      setData((current) => setReviewStatus(current, requestId, 'pending'))
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: request.requester_id,
        entityType: 'review_request',
        entityId: requestId,
        action: 'reopened',
        summary: `request reopened.`,
        metadata: { from_status: request.status, status: 'pending' },
      })
    },

    async resubmitReviewRequest(requestId, comment) {
      assertActiveMember(profile)
      assertFeedbackComment(comment)
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError('검토요청을 찾을 수 없습니다.')
      if (request.requester_id !== profile.id) {
        throw new UserFacingError('본인의 요청만 재요청할 수 있습니다.')
      }
      assertCanResubmit(request.status)
      const feedbackId = newId('feedback')
      setData((current) =>
        resubmitReviewRequestReducer(current, requestId, profile, comment.trim(), feedbackId),
      )
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'review_request',
        entityId: requestId,
        action: 'resubmitted',
        summary: `${request.title} 검토를 다시 요청했습니다.`,
        metadata: {
          from_status: 'rejected',
          status: 'pending',
          review_round: (request.review_round ?? 1) + 1,
        },
      })
    },

    async addReviewFeedback(requestId, comment) {
      assertActiveLeader(profile)
      assertFeedbackComment(comment)
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError('검토요청을 찾을 수 없습니다.')
      const feedbackId = newId('feedback')
      const item: ReviewFeedback = {
        id: feedbackId,
        review_request_id: requestId,
        leader_id: profile.id,
        author_role: 'leader',
        comment: comment.trim(),
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

    async updateReviewFeedback(feedbackId, comment) {
      assertActiveLeader(profile)
      assertFeedbackComment(comment)
      const feedback = data.reviewRequests
        .flatMap((request) => request.review_feedback ?? [])
        .find((item) => item.id === feedbackId)
      if (!feedback) throw new UserFacingError('피드백을 찾을 수 없습니다.')
      if ((feedback.author_role ?? 'leader') !== 'leader' || feedback.leader_id !== profile.id) {
        throw new UserFacingError('본인이 작성한 파트장 피드백만 수정할 수 있습니다.')
      }
      const request = data.reviewRequests.find((item) => item.id === feedback.review_request_id)
      const trimmedComment = comment.trim()
      setData((current) => updateReviewFeedback(current, feedbackId, trimmedComment))
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: request?.requester_id ?? null,
        entityType: 'review_feedback',
        entityId: feedbackId,
        action: 'updated',
        summary: `feedback updated.`,
        metadata: { review_request_id: feedback.review_request_id },
      })
    },

    async deleteReviewFeedback(feedbackId) {
      assertActiveLeader(profile)
      const feedback = data.reviewRequests
        .flatMap((request) => request.review_feedback ?? [])
        .find((item) => item.id === feedbackId)
      if (!feedback) throw new UserFacingError('피드백을 찾을 수 없습니다.')
      if ((feedback.author_role ?? 'leader') !== 'leader' || feedback.leader_id !== profile.id) {
        throw new UserFacingError('본인이 작성한 파트장 피드백만 삭제할 수 있습니다.')
      }
      const request = data.reviewRequests.find((item) => item.id === feedback.review_request_id)
      setData((current) => removeReviewFeedback(current, feedbackId))
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: request?.requester_id ?? null,
        entityType: 'review_feedback',
        entityId: feedbackId,
        action: 'deleted',
        summary: `feedback deleted.`,
        metadata: { review_request_id: feedback.review_request_id },
      })
    },
  }
}
