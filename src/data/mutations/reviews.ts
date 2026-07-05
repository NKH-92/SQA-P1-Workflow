import { validateStorageAttachmentOwnership } from '../../lib/attachments'
import { recordActivityLog } from '../../lib/activityLog'
import { makeId, reviewStatusLabels } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { ReviewFeedback, ReviewStatus } from '../../types'
import type { RepositoryContext } from '../repositoryContext'

export type ReviewRequestPayload = {
  title: string
  description: string
  attachment_url: string | null
  due_date: string | null
}

export async function saveReviewRequest(
  ctx: RepositoryContext,
  input: {
    editingReviewId: string | null
    payload: ReviewRequestPayload
  },
): Promise<{ reviewId: string; isUpdate: boolean }> {
  const { profile, setData } = ctx
  const { editingReviewId, payload } = input
  const { title, due_date: dueDate } = payload

  const attachmentError = validateStorageAttachmentOwnership(profile.id, payload.attachment_url)
  if (attachmentError) throw new Error(attachmentError)

  if (editingReviewId) {
    if (ctx.isRemote) {
      const { error } = await supabase!.from('review_requests').update(payload).eq('id', editingReviewId)
      if (error) throw error
    } else {
      setData((current) => ({
        ...current,
        reviewRequests: current.reviewRequests.map((request) =>
          request.id === editingReviewId
            ? { ...request, ...payload, updated_at: new Date().toISOString() }
            : request,
        ),
      }))
    }
    await recordActivityLog(setData, {
      actor: profile,
      entityType: 'review_request',
      entityId: editingReviewId,
      action: 'updated',
      summary: `${profile.name}님이 ${title} 검토요청을 수정했습니다.`,
      metadata: { due_date: dueDate },
    }, { isRemote: ctx.isRemote })
    return { reviewId: editingReviewId, isUpdate: true }
  }

  let reviewId: string
  if (ctx.isRemote) {
    const { data: created, error } = await supabase!.from('review_requests').insert({
      requester_id: profile.id,
      ...payload,
      status: 'pending',
    }).select('id').single()
    if (error) throw error
    reviewId = created?.id ?? ''
    await recordActivityLog(setData, {
      actor: profile,
      entityType: 'review_request',
      entityId: created?.id ?? null,
      action: 'created',
      summary: `${profile.name}님이 ${title} 검토를 요청했습니다.`,
      metadata: { due_date: dueDate },
    }, { isRemote: ctx.isRemote })
  } else {
    reviewId = makeId('review')
    setData((current) => ({
      ...current,
      reviewRequests: [
        {
          id: reviewId,
          requester_id: profile.id,
          title: payload.title,
          description: payload.description,
          attachment_url: payload.attachment_url,
          due_date: payload.due_date,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          profiles: { name: profile.name, email: profile.email },
          review_feedback: [],
        },
        ...current.reviewRequests,
      ],
    }))
    await recordActivityLog(setData, {
      actor: profile,
      entityType: 'review_request',
      entityId: reviewId,
      action: 'created',
      summary: `${profile.name}님이 ${title} 검토를 요청했습니다.`,
      metadata: { due_date: dueDate },
    }, { isRemote: ctx.isRemote })
  }

  return { reviewId, isUpdate: false }
}

export async function withdrawReviewRequest(ctx: RepositoryContext, requestId: string): Promise<void> {
  const { profile, data, setData } = ctx
  const request = data.reviewRequests.find((item) => item.id === requestId)
  if (!request) return

  if (ctx.isRemote) {
    const { error } = await supabase!.from('review_requests').delete().eq('id', requestId)
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      reviewRequests: current.reviewRequests.filter((item) => item.id !== requestId),
    }))
  }
  await recordActivityLog(setData, {
    actor: profile,
    entityType: 'review_request',
    entityId: requestId,
    action: 'withdrawn',
    summary: `${profile.name}님이 ${request.title} 검토요청을 회수했습니다.`,
  }, { isRemote: ctx.isRemote })
}

export async function rejectReviewRequest(
  ctx: RepositoryContext,
  requestId: string,
  comment: string,
): Promise<void> {
  const { profile, data, setData } = ctx
  const request = data.reviewRequests.find((item) => item.id === requestId)

  if (ctx.isRemote) {
    const { error } = await supabase!.rpc('reject_review_request', {
      p_review_request_id: requestId,
      p_comment: comment,
    })
    if (error) throw error
  } else {
    const item: ReviewFeedback = {
      id: makeId('feedback'),
      review_request_id: requestId,
      leader_id: profile.id,
      comment,
      created_at: new Date().toISOString(),
      profiles: { name: profile.name },
    }
    setData((current) => ({
      ...current,
      reviewRequests: current.reviewRequests.map((row) =>
        row.id === requestId
          ? { ...row, status: 'rejected', review_feedback: [...(row.review_feedback ?? []), item] }
          : row,
      ),
    }))
  }
  await recordActivityLog(setData, {
    actor: profile,
    targetUserId: request?.requester_id ?? null,
    entityType: 'review_request',
    entityId: requestId,
    action: 'status_changed',
    summary: `${request?.title ?? '검토요청'}을 반려했습니다.`,
    metadata: { status: 'rejected' },
  }, { isRemote: ctx.isRemote })
}

export async function updateReviewStatus(
  ctx: RepositoryContext,
  requestId: string,
  status: ReviewStatus,
): Promise<void> {
  const { profile, data, setData } = ctx
  const request = data.reviewRequests.find((item) => item.id === requestId)

  if (ctx.isRemote) {
    const { error } = await supabase!.from('review_requests').update({ status }).eq('id', requestId)
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      reviewRequests: current.reviewRequests.map((row) =>
        row.id === requestId ? { ...row, status, updated_at: new Date().toISOString() } : row,
      ),
    }))
  }
  await recordActivityLog(setData, {
    actor: profile,
    targetUserId: request?.requester_id ?? null,
    entityType: 'review_request',
    entityId: requestId,
    action: 'status_changed',
    summary: `${request?.title ?? '검토요청'} 상태를 ${reviewStatusLabels[status]}로 변경했습니다.`,
    metadata: { status },
  }, { isRemote: ctx.isRemote })
}

export async function addReviewFeedback(
  ctx: RepositoryContext,
  requestId: string,
  comment: string,
): Promise<void> {
  const { profile, data, setData } = ctx
  const request = data.reviewRequests.find((item) => item.id === requestId)
  let feedbackId: string | null

  if (ctx.isRemote) {
    const { data: createdId, error } = await supabase!.rpc('add_review_feedback', {
      p_review_request_id: requestId,
      p_comment: comment,
    })
    if (error) throw error
    feedbackId = typeof createdId === 'string' ? createdId : null
  } else {
    feedbackId = makeId('feedback')
    const item: ReviewFeedback = {
      id: feedbackId,
      review_request_id: requestId,
      leader_id: profile.id,
      comment,
      created_at: new Date().toISOString(),
      profiles: { name: profile.name },
    }
    setData((current) => ({
      ...current,
      reviewRequests: current.reviewRequests.map((row) =>
        row.id === requestId
          ? { ...row, review_feedback: [...(row.review_feedback ?? []), item] }
          : row,
      ),
    }))
  }
  await recordActivityLog(setData, {
    actor: profile,
    targetUserId: request?.requester_id ?? null,
    entityType: 'review_feedback',
    entityId: feedbackId,
    action: 'created',
    summary: `${request?.title ?? '검토요청'}에 피드백을 남겼습니다.`,
    metadata: { review_request_id: requestId },
  }, { isRemote: ctx.isRemote })
}
