import { UserFacingError } from '../../lib/errors'
import { buildReviewReadReceipts } from '../../lib/readState'
import { supabase } from '../../lib/supabase'
import { canViewTeamData } from '../../domain/permissions'
import type { RepositoryDeps, ReviewRepository } from '../repositories/types'
import {
  assertActiveMember,
  assertCanReject,
  assertCanReopen,
  assertCanResubmit,
  assertFeedbackComment,
  normalizeReviewRequestPayload,
  assertReviewStatusTransition,
} from '../validation/reviews'
import { translateReviewOccError } from './reviewOccError'

function throwReviewError(error: { message?: string }): never {
  throw translateReviewOccError(error)
}

export function createSupabaseReviewRepository(ctx: RepositoryDeps): ReviewRepository {
  const { profile, data, setData } = ctx

  return {
    async saveReviewRequest({ editingReviewId, payload }) {
      if (editingReviewId) {
        const previous = data.reviewRequests.find((item) => item.id === editingReviewId)
        if (!previous) throw new UserFacingError('검토요청을 찾을 수 없습니다.')
        const normalized = normalizeReviewRequestPayload(payload, { existingDueDate: previous.due_date })
        const { error } = await supabase!.rpc('update_review_request', {
          p_review_request_id: editingReviewId,
          p_expected_updated_at: previous.updated_at,
          p_title: normalized.title,
          p_description: normalized.description,
          p_due_date: normalized.due_date,
        })
        if (error) throwReviewError(error)
        return { reviewId: editingReviewId, isUpdate: true }
      }

      const normalized = normalizeReviewRequestPayload(payload)
      const { data: createdId, error } = await supabase!.rpc('create_review_request', {
        p_title: normalized.title,
        p_description: normalized.description,
        p_due_date: normalized.due_date,
      })
      if (error) throwReviewError(error)
      return { reviewId: typeof createdId === 'string' ? createdId : '', isUpdate: false }
    },

    async withdrawReviewRequest(requestId, reason) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError('검토요청을 찾을 수 없습니다.')
      const { error } = await supabase!.rpc('withdraw_review_request', {
        p_review_request_id: requestId,
        p_expected_updated_at: request.updated_at,
        p_reason: reason.trim(),
      })
      if (error) throwReviewError(error)
    },

    async rejectReviewRequest(requestId, comment) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError('검토요청을 찾을 수 없습니다.')
      assertCanReject(request.status)
      if (comment.trim().length > 2000) throw new UserFacingError('피드백은 2000자 이내로 입력해 주세요.')
      const { error } = await supabase!.rpc('reject_review_request', {
        p_review_request_id: requestId,
        p_expected_updated_at: request.updated_at,
        p_comment: comment.trim(),
      })
      if (error) throwReviewError(error)
    },

    async updateReviewStatus(requestId, status) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError('검토요청을 찾을 수 없습니다.')
      assertReviewStatusTransition(request.status, status)
      if (status !== 'approved') throw new UserFacingError('승인 이외의 상태 변경은 전용 동작을 사용해 주세요.')
      const { error } = await supabase!.rpc('approve_review_request', {
        p_review_request_id: requestId,
        p_expected_updated_at: request.updated_at,
      })
      if (error) throwReviewError(error)
    },

    async reopenReviewRequest(requestId) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError('검토요청을 찾을 수 없습니다.')
      assertCanReopen(request.status)
      const { error } = await supabase!.rpc('reopen_review_request', {
        p_review_request_id: requestId,
        p_expected_updated_at: request.updated_at,
      })
      if (error) throwReviewError(error)
    },

    async resubmitReviewRequest(requestId, comment) {
      assertActiveMember(profile)
      assertFeedbackComment(comment)
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request || request.requester_id !== profile.id) {
        throw new UserFacingError('본인의 요청만 재요청할 수 있습니다.')
      }
      assertCanResubmit(request.status)
      const { error } = await supabase!.rpc('resubmit_review_request', {
        p_review_request_id: requestId,
        p_expected_updated_at: request.updated_at,
        p_comment: comment.trim(),
      })
      if (error) throwReviewError(error)
    },

    async addReviewFeedback(requestId, comment) {
      assertFeedbackComment(comment)
      const { data: createdId, error } = await supabase!.rpc('add_review_feedback', {
        p_review_request_id: requestId,
        p_comment: comment.trim(),
      })
      if (error) throwReviewError(error)
      return typeof createdId === 'string' ? createdId : null
    },

    async updateReviewFeedback(feedbackId, comment) {
      assertFeedbackComment(comment)
      const feedback = data.reviewRequests
        .flatMap((request) => request.review_feedback ?? [])
        .find((item) => item.id === feedbackId)
      if (!feedback) throw new UserFacingError('피드백을 찾을 수 없습니다.')
      const { error } = await supabase!.rpc('update_review_feedback', {
        p_feedback_id: feedbackId,
        p_expected_updated_at: feedback.updated_at ?? feedback.created_at,
        p_comment: comment.trim(),
      })
      if (error) throwReviewError(error)
    },

    async voidReviewFeedback(feedbackId, reason) {
      const feedback = data.reviewRequests
        .flatMap((request) => request.review_feedback ?? [])
        .find((item) => item.id === feedbackId)
      if (!feedback) throw new UserFacingError('피드백을 찾을 수 없습니다.')
      const { error } = await supabase!.rpc('void_review_feedback', {
        p_feedback_id: feedbackId,
        p_expected_updated_at: feedback.updated_at ?? feedback.created_at,
        p_reason: reason.trim(),
      })
      if (error) throwReviewError(error)
    },

    async markReviewSeen(requestId) {
      const { data: latestEventId, error } = await supabase!.rpc('mark_review_seen', {
        p_review_request_id: requestId,
      })
      if (error) throw error
      const parsedEventId = latestEventId == null ? '' : String(latestEventId)
      if (!/^\d+$/.test(parsedEventId)) return
      setData((current) => ({
        ...current,
        reviewReadReceipts: [
          ...(current.reviewReadReceipts ?? []).filter(
            (receipt) => !(receipt.user_id === profile.id && receipt.review_request_id === requestId),
          ),
          {
            user_id: profile.id,
            review_request_id: requestId,
            last_seen_event_id: parsedEventId,
            read_at: new Date().toISOString(),
          },
        ],
      }))
    },

    async markAllRelevantReviewsSeen() {
      const { error } = await supabase!.rpc('mark_all_relevant_reviews_seen')
      if (error) throw error
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
