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
  assertRejectReason,
  assertResubmitNote,
  normalizeReviewRequestPayload,
  assertReviewStatusTransition,
} from '../validation/reviews'
import { REVIEW_NOT_FOUND_MESSAGE, translateReviewOccError } from './reviewOccError'

function throwReviewError(error: { message?: string }): never {
  throw translateReviewOccError(error)
}

export function createSupabaseReviewRepository(ctx: RepositoryDeps): ReviewRepository {
  const { profile, data, setData } = ctx
  /**
   * 이 저장소 인스턴스가 직접 쓴 뒤 서버가 돌려준 최신 버전(updated_at).
   * ‘고쳐서 다시 요청하기’처럼 수정 직후 같은 요청에 이어서 쓰는 경우, 화면이 새로고침되기 전의
   * 스냅샷 값 대신 방금 받은 버전으로 낙관적 잠금(OCC)을 통과한다. RPC 이름·인자는 그대로다.
   */
  const knownRevisions = new Map<string, string>()
  const expectedRevision = (requestId: string, fallback: string | undefined) =>
    knownRevisions.get(requestId) ?? fallback

  return {
    async saveReviewRequest({ editingReviewId, payload }) {
      if (editingReviewId) {
        const previous = data.reviewRequests.find((item) => item.id === editingReviewId)
        if (!previous) throw new UserFacingError(REVIEW_NOT_FOUND_MESSAGE)
        const normalized = normalizeReviewRequestPayload(payload, { existingDueDate: previous.due_date })
        const { data: nextUpdatedAt, error } = await supabase!.rpc('update_review_request', {
          p_review_request_id: editingReviewId,
          p_expected_updated_at: expectedRevision(editingReviewId, previous.updated_at),
          p_title: normalized.title,
          p_description: normalized.description,
          p_due_date: normalized.due_date,
        })
        if (error) throwReviewError(error)
        if (typeof nextUpdatedAt === 'string' && nextUpdatedAt) knownRevisions.set(editingReviewId, nextUpdatedAt)
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
      if (!request) throw new UserFacingError(REVIEW_NOT_FOUND_MESSAGE)
      if (reason.trim().length < 2) throw new UserFacingError('회수 사유를 2자 이상 적어 주세요.')
      const { error } = await supabase!.rpc('withdraw_review_request', {
        p_review_request_id: requestId,
        p_expected_updated_at: expectedRevision(requestId, request.updated_at),
        p_reason: reason.trim(),
      })
      if (error) throwReviewError(error)
    },

    async rejectReviewRequest(requestId, comment) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError(REVIEW_NOT_FOUND_MESSAGE)
      assertCanReject(request.status)
      // 반려 사유는 필수다. 서버 함수는 빈 사유를 허용하지만 화면·로컬과 같은 규칙을 여기서 지킨다.
      assertRejectReason(comment)
      const { error } = await supabase!.rpc('reject_review_request', {
        p_review_request_id: requestId,
        p_expected_updated_at: expectedRevision(requestId, request.updated_at),
        p_comment: comment.trim(),
      })
      if (error) throwReviewError(error)
    },

    async updateReviewStatus(requestId, status) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError(REVIEW_NOT_FOUND_MESSAGE)
      assertReviewStatusTransition(request.status, status)
      if (status !== 'approved') throw new UserFacingError('이 상태로는 바꿀 수 없어요. 목록을 새로고침해 주세요.')
      const { error } = await supabase!.rpc('approve_review_request', {
        p_review_request_id: requestId,
        p_expected_updated_at: expectedRevision(requestId, request.updated_at),
      })
      if (error) throwReviewError(error)
    },

    async reopenReviewRequest(requestId) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError(REVIEW_NOT_FOUND_MESSAGE)
      assertCanReopen(request.status)
      const { error } = await supabase!.rpc('reopen_review_request', {
        p_review_request_id: requestId,
        p_expected_updated_at: expectedRevision(requestId, request.updated_at),
      })
      if (error) throwReviewError(error)
    },

    async resubmitReviewRequest(requestId, comment) {
      assertActiveMember(profile)
      assertResubmitNote(comment)
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request || request.requester_id !== profile.id) {
        throw new UserFacingError('내가 보낸 요청만 다시 요청할 수 있어요.')
      }
      assertCanResubmit(request.status)
      const { error } = await supabase!.rpc('resubmit_review_request', {
        p_review_request_id: requestId,
        p_expected_updated_at: expectedRevision(requestId, request.updated_at),
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
      if (!feedback) throw new UserFacingError('피드백을 찾지 못했어요. 목록을 새로고침해 주세요.')
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
      if (!feedback) throw new UserFacingError('피드백을 찾지 못했어요. 목록을 새로고침해 주세요.')
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
