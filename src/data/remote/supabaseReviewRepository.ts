import { validateStorageAttachmentOwnership } from '../../lib/attachments'
import { recordActivityLog } from '../../lib/activityLog'
import { UserFacingError } from '../../lib/errors'
import { reviewStatusLabels } from '../../lib/format'
import {
  assertCanReject,
  assertReviewStatusTransition,
  assertStorageAttachmentOnly,
} from '../../features/reviews/review.validators'
import { supabase } from '../../lib/supabase'
import type { ReviewStatus } from '../../types'
import type { LocalRepositoryContext, ReviewRepository } from '../repositories/types'
import type { ReviewRequestPayload } from '../local/appDataReducers'

export function createSupabaseReviewRepository(ctx: LocalRepositoryContext): ReviewRepository {
  const { profile, data, setData } = ctx

  return {
    async saveReviewRequest({ editingReviewId, payload }) {
      const { title, due_date: dueDate } = payload
      assertStorageAttachmentOnly(payload.attachment_url)
      const attachmentError = validateStorageAttachmentOwnership(profile.id, payload.attachment_url)
      if (attachmentError) throw new UserFacingError(attachmentError)

      if (editingReviewId) {
        const { error } = await supabase!.from('review_requests').update(payload).eq('id', editingReviewId)
        if (error) throw error
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
      const { error } = await supabase!.from('review_requests').delete().eq('id', requestId)
      if (error) throw error
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

export type { ReviewRequestPayload, ReviewStatus }
