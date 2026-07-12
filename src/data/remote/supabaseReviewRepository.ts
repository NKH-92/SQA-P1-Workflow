import { removeReviewAttachment, validateStorageAttachmentOwnership } from '../../lib/attachments'
import { recordActivityLog } from '../../lib/activityLog'
import { UserFacingError } from '../../lib/errors'
import {
  assertCanReject,
  assertCanReopen,
  assertFeedbackComment,
  assertReviewStatusTransition,
  assertStorageAttachmentOnly,
} from '../../features/reviews/review.validators'
import { supabase } from '../../lib/supabase'
import type { RepositoryDeps, ReviewRepository } from '../repositories/types'

export function createSupabaseReviewRepository(ctx: RepositoryDeps): ReviewRepository {
  const { profile, data, setData } = ctx

  return {
    async saveReviewRequest({ editingReviewId, payload }) {
      const { title, due_date: dueDate } = payload
      assertStorageAttachmentOnly(payload.attachment_url)
      const attachmentError = validateStorageAttachmentOwnership(profile.id, payload.attachment_url)
      if (attachmentError) throw new UserFacingError(attachmentError)

      if (editingReviewId) {
        const previous = data.reviewRequests.find((item) => item.id === editingReviewId)
        if (!previous) throw new UserFacingError('검토요청을 찾을 수 없습니다.')
        const previousAttachment = previous.attachment_url
        const { data: updated, error } = await supabase!
          .from('review_requests')
          .update(payload)
          .eq('id', editingReviewId)
          .eq('updated_at', previous.updated_at)
          .select('id')
        if (error) throw error
        // RLS allows editing only the requester's own pending row. Zero rows means the
          // leader already closed it while the editor was open — surface it instead of a
        // misleading success toast.
        if (!updated || updated.length === 0) {
          throw new UserFacingError('이미 처리된 요청이라 수정할 수 없습니다. 목록을 새로고침해 주세요.')
        }
        if (previousAttachment && previousAttachment !== payload.attachment_url) {
          // ??????쎈솭??removeReviewAttachment ????癒?퐣 ??깊룖筌왖沃샕嚥?野껉퀗?든몴?疫꿸퀡?롧뵳???곸?揶쎛 ??용뼄.
          // ?대끃??await??롢늺 ?源껊궗 ?醫롫뮞?硫? ??쎈꽅?귐? ?類ｋ궗筌띾슦寃???堉깍쭪袁⑤뼄.
          void removeReviewAttachment(previousAttachment)
        }
        await recordActivityLog(setData, {
          actor: profile,
          entityType: 'review_request',
          entityId: editingReviewId,
          action: 'updated',
        summary: `${profile.name}님이 ${title} 검토요청을 수정했습니다.`,
          metadata: { due_date: dueDate },
        }, { isRemote: true })
        return { reviewId: editingReviewId, isUpdate: true }
      }

      const { data: created, error } = await supabase!.from('review_requests').insert({
        requester_id: profile.id,
        ...payload,
        status: 'pending',
      }).select('id').single()
      if (error) throw error
      const reviewId = created?.id ?? ''
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'review_request',
        entityId: created?.id ?? null,
        action: 'created',
        summary: `${profile.name}님이 ${title} 검토를 요청했습니다.`,
        metadata: { due_date: dueDate },
      }, { isRemote: true })
      return { reviewId, isUpdate: false }
    },

    async withdrawReviewRequest(requestId) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      const { data: deleted, error } = await supabase!
        .from('review_requests')
        .delete()
        .eq('id', requestId)
        .select('id')
      if (error) throw error
      if (!deleted || deleted.length === 0) {
        throw new UserFacingError('이미 처리된 요청이라 회수할 수 없습니다. 목록을 새로고침해 주세요.')
      }
      if (request?.attachment_url) void removeReviewAttachment(request.attachment_url)
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'review_request',
        entityId: requestId,
        action: 'withdrawn',
        summary: `${profile.name}님이 ${request?.title ?? '검토요청'} 검토요청을 회수했습니다.`,
      }, { isRemote: true })
    },

    async rejectReviewRequest(requestId, comment) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError('검토요청을 찾을 수 없습니다.')
      assertCanReject(request.status)
      const { error } = await supabase!.rpc('reject_review_request', {
        p_review_request_id: requestId,
        p_comment: comment,
      })
      if (error) throw error
    },

    async updateReviewStatus(requestId, status) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError('검토요청을 찾을 수 없습니다.')
      assertReviewStatusTransition(request.status, status)
      const { error } = await supabase!.rpc('update_review_request_status', {
        p_review_request_id: requestId,
        p_status: status,
      })
      if (error) throw error
    },

    async reopenReviewRequest(requestId) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      if (!request) throw new UserFacingError('검토요청을 찾을 수 없습니다.')
      assertCanReopen(request.status)
      const { error } = await supabase!.rpc('reopen_review_request', {
        p_review_request_id: requestId,
      })
      if (error) throw error
      // The RPC writes the authoritative activity log in the same transaction.
    },

    async addReviewFeedback(requestId, comment) {
      assertFeedbackComment(comment)
      const { data: createdId, error } = await supabase!.rpc('add_review_feedback', {
        p_review_request_id: requestId,
        p_comment: comment,
      })
      if (error) throw error
      const feedbackId = typeof createdId === 'string' ? createdId : null
      return feedbackId
    },

    async updateReviewFeedback(feedbackId, comment) {
      assertFeedbackComment(comment)
      const feedback = data.reviewRequests
        .flatMap((request) => request.review_feedback ?? [])
        .find((item) => item.id === feedbackId)
      if (!feedback) throw new UserFacingError('피드백을 찾을 수 없습니다.')
      if (feedback.leader_id !== profile.id) throw new UserFacingError('본인이 작성한 피드백만 수정할 수 있습니다.')
      const request = data.reviewRequests.find((item) => item.id === feedback.review_request_id)
      const { data: updated, error } = await supabase!
        .from('review_feedback')
        .update({ comment: comment.trim() })
        .eq('id', feedbackId)
        .select('id')
      if (error) throw error
      if (!updated || updated.length === 0) {
        throw new UserFacingError('피드백을 수정할 수 없습니다. 목록을 새로고침해 주세요.')
      }
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: request?.requester_id ?? null,
        entityType: 'review_feedback',
        entityId: feedbackId,
        action: 'updated',
        summary: `feedback updated.`,
        metadata: { review_request_id: feedback.review_request_id },
      }, { isRemote: true })
    },

    async deleteReviewFeedback(feedbackId) {
      const feedback = data.reviewRequests
        .flatMap((request) => request.review_feedback ?? [])
        .find((item) => item.id === feedbackId)
      if (!feedback) throw new UserFacingError('피드백을 찾을 수 없습니다.')
      if (feedback.leader_id !== profile.id) throw new UserFacingError('본인이 작성한 피드백만 삭제할 수 있습니다.')
      const request = data.reviewRequests.find((item) => item.id === feedback.review_request_id)
      const { data: deleted, error } = await supabase!
        .from('review_feedback')
        .delete()
        .eq('id', feedbackId)
        .select('id')
      if (error) throw error
      if (!deleted || deleted.length === 0) {
        throw new UserFacingError('피드백을 삭제할 수 없습니다. 목록을 새로고침해 주세요.')
      }
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: request?.requester_id ?? null,
        entityType: 'review_feedback',
        entityId: feedbackId,
        action: 'deleted',
        summary: `feedback deleted.`,
        metadata: { review_request_id: feedback.review_request_id },
      }, { isRemote: true })
    },
  }
}
