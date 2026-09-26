import { recordActivityLog } from '../activityLog'
import { UserFacingError } from '../../lib/errors'
import { quoted, quotedWithJosa } from '../../lib/korean'
import {
  buildReviewReadReceipts,
  latestRelevantReviewEvent,
} from '../../lib/readState'
import type { ReviewFeedback } from '../../types'
import { canViewTeamData } from '../../domain/permissions'
import type { RepositoryDeps, ReviewRepository } from '../repositories/types'
import {
  assertActiveLeader,
  assertActiveMember,
  assertCanReject,
  assertCanReopen,
  assertCanResubmit,
  assertFeedbackComment,
  assertRejectReason,
  assertResubmitNote,
  normalizeReviewRequestPayload,
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

const REVIEW_NOT_FOUND_MESSAGE = '검토요청을 찾지 못했어요. 목록을 새로고침해 주세요.'
const FEEDBACK_NOT_FOUND_MESSAGE = '피드백을 찾지 못했어요. 목록을 새로고침해 주세요.'

export function createLocalReviewRepository(ctx: RepositoryDeps): ReviewRepository {
  const { profile, data, setData, activityLogs } = ctx

  return {
    async saveReviewRequest({ editingReviewId, payload }) {
      if (editingReviewId) {
        // Parity with remote RLS: a requester may correct a pending or rejected request.
        const target = data.reviewRequests.find((item) => item.id === editingReviewId)
        if (!target) {
          throw new UserFacingError(REVIEW_NOT_FOUND_MESSAGE)
        }
        if (target.status !== 'pending' && target.status !== 'rejected') {
          throw new UserFacingError('이미 처리한 요청이라 수정할 수 없어요. 목록을 새로고침해 주세요.')
        }
        if (target.requester_id !== profile.id) {
          throw new UserFacingError('내가 보낸 요청만 수정할 수 있어요.')
        }
        const normalized = normalizeReviewRequestPayload(payload, { existingDueDate: target.due_date })
        setData((current) => updateReviewRequest(current, editingReviewId, normalized))
        await recordActivityLog(activityLogs, {
          actor: profile,
          entityType: 'review_request',
          entityId: editingReviewId,
          action: 'updated',
          summary: `${profile.name}님이 ${quotedWithJosa(normalized.title, '을/를')} 수정했어요.`,
          metadata: { due_date: normalized.due_date },
        })
        return { reviewId: editingReviewId, isUpdate: true }
      }

      const normalized = normalizeReviewRequestPayload(payload)
      const reviewId = newId('review')
      setData((current) => createReviewRequest(current, profile, reviewId, normalized))
      await recordActivityLog(activityLogs, {
        actor: profile,
        entityType: 'review_request',
        entityId: reviewId,
        action: 'created',
        summary: `${profile.name}님이 ${quoted(normalized.title)} 검토를 요청했어요.`,
        metadata: { due_date: normalized.due_date },
      })
      return { reviewId, isUpdate: false }
    },

    async withdrawReviewRequest(requestId, reason) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) {
        throw new UserFacingError(REVIEW_NOT_FOUND_MESSAGE)
      }
      if (request.status !== 'pending') {
        throw new UserFacingError('이미 처리한 요청이라 회수할 수 없어요. 목록을 새로고침해 주세요.')
      }
      if (request.requester_id !== profile.id) {
        throw new UserFacingError('내가 보낸 요청만 회수할 수 있어요.')
      }
      if (reason.trim().length < 2) throw new UserFacingError('회수 사유를 2자 이상 적어 주세요.')
      setData((current) => withdrawReviewRequest(current, requestId, profile, reason.trim()))
      await recordActivityLog(activityLogs, {
        actor: profile,
        entityType: 'review_request',
        entityId: requestId,
        action: 'withdrawn',
        summary: `${profile.name}님이 ${quotedWithJosa(request.title, '을/를')} 회수했어요.`,
        metadata: { reason: reason.trim() },
      })
    },

    async rejectReviewRequest(requestId, comment) {
      assertActiveLeader(profile)
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError(REVIEW_NOT_FOUND_MESSAGE)
      assertCanReject(request.status)
      // 반려 사유는 필수다(원격 어댑터와 같은 규칙). 사유는 요청자에게 피드백으로 남는다.
      assertRejectReason(comment)
      const trimmedComment = comment.trim()
      const feedbackId = newId('feedback')
      setData((current) => rejectReviewRequestReducer(current, requestId, profile, trimmedComment, feedbackId))
      await recordActivityLog(activityLogs, {
        actor: profile,
        targetUserId: request.requester_id ?? null,
        entityType: 'review_request',
        entityId: requestId,
        action: 'status_changed',
        summary: `${quotedWithJosa(request.title, '을/를')} 반려했어요.`,
        metadata: { status: 'rejected', comment_provided: true },
      })
    },

    async updateReviewStatus(requestId, status) {
      assertActiveLeader(profile)
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError(REVIEW_NOT_FOUND_MESSAGE)
      assertReviewStatusTransition(request.status, status)
      setData((current) => setReviewStatus(current, requestId, status, profile))
      await recordActivityLog(activityLogs, {
        actor: profile,
        targetUserId: request.requester_id ?? null,
        entityType: 'review_request',
        entityId: requestId,
        action: 'status_changed',
        summary: status === 'approved'
          ? `${quotedWithJosa(request.title, '을/를')} 승인했어요.`
          : `${quoted(request.title)} 상태를 바꿨어요.`,
        metadata: { status },
      })
    },

    async reopenReviewRequest(requestId) {
      assertActiveLeader(profile)
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError(REVIEW_NOT_FOUND_MESSAGE)
      assertCanReopen(request.status)
      setData((current) => setReviewStatus(current, requestId, 'pending', profile))
      await recordActivityLog(activityLogs, {
        actor: profile,
        targetUserId: request.requester_id,
        entityType: 'review_request',
        entityId: requestId,
        action: 'reopened',
        summary: `${quotedWithJosa(request.title, '을/를')} 다시 열었어요.`,
        metadata: { from_status: request.status, status: 'pending' },
      })
    },

    async resubmitReviewRequest(requestId, comment) {
      assertActiveMember(profile)
      assertResubmitNote(comment)
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError(REVIEW_NOT_FOUND_MESSAGE)
      if (request.requester_id !== profile.id) {
        throw new UserFacingError('내가 보낸 요청만 다시 요청할 수 있어요.')
      }
      assertCanResubmit(request.status)
      const feedbackId = newId('feedback')
      setData((current) =>
        resubmitReviewRequestReducer(current, requestId, profile, comment.trim(), feedbackId),
      )
      await recordActivityLog(activityLogs, {
        actor: profile,
        entityType: 'review_request',
        entityId: requestId,
        action: 'resubmitted',
        summary: `${quoted(request.title)} 검토를 다시 요청했어요.`,
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
      if (!request) throw new UserFacingError(REVIEW_NOT_FOUND_MESSAGE)
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
      await recordActivityLog(activityLogs, {
        actor: profile,
        targetUserId: request.requester_id ?? null,
        entityType: 'review_feedback',
        entityId: feedbackId,
        action: 'created',
        summary: `${quoted(request.title)}에 피드백을 남겼어요.`,
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
      if (!feedback) throw new UserFacingError(FEEDBACK_NOT_FOUND_MESSAGE)
      if ((feedback.author_role ?? 'leader') !== 'leader' || feedback.leader_id !== profile.id) {
        throw new UserFacingError('내가 남긴 피드백만 수정할 수 있어요.')
      }
      const request = data.reviewRequests.find((item) => item.id === feedback.review_request_id)
      const trimmedComment = comment.trim()
      setData((current) => updateReviewFeedback(current, feedbackId, trimmedComment, profile))
      await recordActivityLog(activityLogs, {
        actor: profile,
        targetUserId: request?.requester_id ?? null,
        entityType: 'review_feedback',
        entityId: feedbackId,
        action: 'updated',
        summary: '검토 피드백을 수정했어요.',
        metadata: { review_request_id: feedback.review_request_id },
      })
    },

    async voidReviewFeedback(feedbackId, reason) {
      assertActiveLeader(profile)
      const feedback = data.reviewRequests
        .flatMap((request) => request.review_feedback ?? [])
        .find((item) => item.id === feedbackId)
      if (!feedback) throw new UserFacingError(FEEDBACK_NOT_FOUND_MESSAGE)
      if ((feedback.author_role ?? 'leader') !== 'leader' || feedback.leader_id !== profile.id) {
        throw new UserFacingError('내가 남긴 피드백만 무효화할 수 있어요.')
      }
      if (feedback.voided_at) throw new UserFacingError('이미 무효화한 피드백이에요.')
      if (reason.trim().length < 2) throw new UserFacingError('무효화 사유를 2자 이상 적어 주세요.')
      const request = data.reviewRequests.find((item) => item.id === feedback.review_request_id)
      setData((current) => voidReviewFeedback(current, feedbackId, profile, reason.trim()))
      await recordActivityLog(activityLogs, {
        actor: profile,
        targetUserId: request?.requester_id ?? null,
        entityType: 'review_feedback',
        entityId: feedbackId,
        action: 'voided',
        summary: '검토 피드백을 무효화했어요.',
        metadata: { review_request_id: feedback.review_request_id, reason: reason.trim() },
      })
    },

    async markReviewSeen(requestId) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request || (profile.role !== 'leader' && request.requester_id !== profile.id)) {
        throw new UserFacingError(REVIEW_NOT_FOUND_MESSAGE)
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
            last_seen_event_id: String(latest.id),
            read_at: new Date().toISOString(),
          },
        ],
      }))
    },

    async markAllRelevantReviewsSeen() {
      const relevantRequests = data.reviewRequests.filter((request) =>
        canViewTeamData(profile) || request.requester_id === profile.id,
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
