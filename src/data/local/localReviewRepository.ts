import { recordActivityLog } from '../../lib/activityLog'
import { UserFacingError } from '../../lib/errors'
import { reviewStatusLabels } from '../../lib/format'
import {
  buildReviewReadReceipts,
  latestRelevantReviewEvent,
} from '../../lib/readState'
import type { ReviewFeedback } from '../../types'
import type { RepositoryDeps, ReviewRepository } from '../repositories/types'
import {
  assertActiveLeader,
  assertActiveMember,
  assertCanReject,
  assertCanReopen,
  assertCanResubmit,
  assertFeedbackComment,
  assertReviewStatusTransition,
} from '../validation/reviews'
import {
  appendReviewFeedback,
  createReviewRequest,
  newId,
  rejectReviewRequest as rejectReviewRequestReducer,
  resubmitReviewRequest as resubmitReviewRequestReducer,
  voidReviewFeedback,
  withdrawReviewRequest,
  setReviewStatus,
  updateReviewFeedback,
  updateReviewRequest,
} from './appDataReducers'

export function createLocalReviewRepository(ctx: RepositoryDeps): ReviewRepository {
  const { profile, data, setData } = ctx

  return {
    async saveReviewRequest({ editingReviewId, payload }) {
      const { title, due_date: dueDate } = payload
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

    async withdrawReviewRequest(requestId, reason) {
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
      if (reason.trim().length < 2) throw new UserFacingError('회수 사유를 2자 이상 입력해 주세요.')
      setData((current) => withdrawReviewRequest(current, requestId, profile, reason.trim()))
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'review_request',
        entityId: requestId,
        action: 'withdrawn',
        summary: `${profile.name}님이 ${request.title} 검토요청을 회수했습니다.`,
        metadata: { reason: reason.trim() },
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
      setData((current) => setReviewStatus(current, requestId, status, profile))
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
      setData((current) => setReviewStatus(current, requestId, 'pending', profile))
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: request.requester_id,
        entityType: 'review_request',
        entityId: requestId,
        action: 'reopened',
        summary: `${request.title} 검토요청을 다시 열었습니다.`,
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
      setData((current) => appendReviewFeedback(current, requestId, item, profile))
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
      setData((current) => updateReviewFeedback(current, feedbackId, trimmedComment, profile))
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: request?.requester_id ?? null,
        entityType: 'review_feedback',
        entityId: feedbackId,
        action: 'updated',
        summary: `검토 피드백을 수정했습니다.`,
        metadata: { review_request_id: feedback.review_request_id },
      })
    },

    async voidReviewFeedback(feedbackId, reason) {
      assertActiveLeader(profile)
      const feedback = data.reviewRequests
        .flatMap((request) => request.review_feedback ?? [])
        .find((item) => item.id === feedbackId)
      if (!feedback) throw new UserFacingError('피드백을 찾을 수 없습니다.')
      if ((feedback.author_role ?? 'leader') !== 'leader' || feedback.leader_id !== profile.id) {
        throw new UserFacingError('본인이 작성한 파트장 피드백만 무효화할 수 있습니다.')
      }
      if (feedback.voided_at) throw new UserFacingError('이미 무효화된 피드백입니다.')
      if (reason.trim().length < 2) throw new UserFacingError('무효화 사유를 2자 이상 입력해 주세요.')
      const request = data.reviewRequests.find((item) => item.id === feedback.review_request_id)
      setData((current) => voidReviewFeedback(current, feedbackId, profile, reason.trim()))
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: request?.requester_id ?? null,
        entityType: 'review_feedback',
        entityId: feedbackId,
        action: 'voided',
        summary: `검토 피드백을 무효화했습니다.`,
        metadata: { review_request_id: feedback.review_request_id, reason: reason.trim() },
      })
    },

    async markReviewSeen(requestId) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request || (profile.role !== 'leader' && request.requester_id !== profile.id)) {
        throw new UserFacingError('검토요청을 찾을 수 없습니다.')
      }
      const latest = latestRelevantReviewEvent(request, profile, data)
      if (!latest) return
      setData((current) => ({
        ...current,
        reviewReadReceipts: [
          ...(current.reviewReadReceipts ?? []).filter((receipt) => !(receipt.user_id === profile.id && receipt.review_request_id === requestId)),
          {
            user_id: profile.id,
            review_request_id: requestId,
            last_seen_event_id: Number(latest.id),
            read_at: new Date().toISOString(),
          },
        ],
      }))
    },

    async markAllRelevantReviewsSeen() {
      const relevantRequests = data.reviewRequests.filter((request) =>
        profile.role === 'leader' || request.requester_id === profile.id,
      )
      const now = new Date().toISOString()
      setData((current) => ({
        ...current,
        reviewReadReceipts: [
          ...(current.reviewReadReceipts ?? []).filter((receipt) => receipt.user_id !== profile.id),
          ...buildReviewReadReceipts(relevantRequests, profile, data.reviewEvents ?? [], now),
        ],
      }))
    },
  }
}
