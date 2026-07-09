import { removeReviewAttachment, validateStorageAttachmentOwnership } from '../../lib/attachments'
import { recordActivityLog } from '../../lib/activityLog'
import { UserFacingError } from '../../lib/errors'
import { reviewStatusLabels } from '../../lib/format'
import {
  assertCanReject,
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
        const previousAttachment = data.reviewRequests.find((item) => item.id === editingReviewId)?.attachment_url
        const { data: updated, error } = await supabase!
          .from('review_requests')
          .update(payload)
          .eq('id', editingReviewId)
          .select('id')
        if (error) throw error
        // RLS allows editing only the requester's own pending row. Zero rows means the
        // leader already closed it while the editor was open — surface it instead of a
        // misleading success toast.
        if (!updated || updated.length === 0) {
          throw new UserFacingError('이미 처리된 요청이라 수정할 수 없습니다. 목록을 새로고침해 주세요.')
        }
        if (previousAttachment && previousAttachment !== payload.attachment_url) {
          // 삭제 실패는 removeReviewAttachment 내부에서 삼켜지므로 결과를 기다릴 이유가 없다.
          // 굳이 await하면 성공 토스트가 스토리지 왕복만큼 늦어진다.
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
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: request?.requester_id ?? null,
        entityType: 'review_request',
        entityId: requestId,
        action: 'status_changed',
        summary: `${request?.title ?? '검토요청'}을 반려했습니다.`,
        metadata: { status: 'rejected' },
      }, { isRemote: true })
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
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: request?.requester_id ?? null,
        entityType: 'review_request',
        entityId: requestId,
        action: 'status_changed',
        summary: `${request?.title ?? '검토요청'} 상태를 ${reviewStatusLabels[status]}로 변경했습니다.`,
        metadata: { status },
      }, { isRemote: true })
    },

    async addReviewFeedback(requestId, comment) {
      const request = data.reviewRequests.find((item) => item.id === requestId)
      const { data: createdId, error } = await supabase!.rpc('add_review_feedback', {
        p_review_request_id: requestId,
        p_comment: comment,
      })
      if (error) throw error
      const feedbackId = typeof createdId === 'string' ? createdId : null
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: request?.requester_id ?? null,
        entityType: 'review_feedback',
        entityId: feedbackId,
        action: 'created',
        summary: `${request?.title ?? '검토요청'}에 피드백을 남겼습니다.`,
        metadata: { review_request_id: requestId },
      }, { isRemote: true })
      return feedbackId
    },
  }
}
