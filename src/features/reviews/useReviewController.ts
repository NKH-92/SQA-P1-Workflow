import { useMemo } from 'react'
import {
  addReviewFeedback,
  createRepositoryContext,
  fetchWithdrawnReviewRequestsPage,
  markReviewSeen,
  mergeReviewRequests,
  reopenReviewRequest,
  rejectReviewRequest,
  resubmitReviewRequest,
  saveReviewRequest,
  updateReviewFeedback,
  updateReviewStatus,
  voidReviewFeedback,
  withdrawReviewRequest,
} from '../../data'
import type { AppData, Profile, ReviewStatus } from '../../types'
import type { AppDataUpdater } from '../../data/repositories/appDataUpdater'
import type { ReviewRequestPayload } from '../../data/contracts'

export function useReviewController(profile: Profile, data: AppData, setData: AppDataUpdater) {
  const context = useMemo(
    () => createRepositoryContext(profile, data, setData),
    [data, profile, setData],
  )

  return {
    async loadArchivePage(page: number) {
      const requests = await fetchWithdrawnReviewRequestsPage(page)
      setData((current) => ({
        ...current,
        reviewRequests: mergeReviewRequests(current.reviewRequests, requests),
      }))
      return requests.length
    },
    markSeen: (requestId: string) => markReviewSeen(context, requestId),
    save: (editingReviewId: string | null, payload: ReviewRequestPayload) =>
      saveReviewRequest(context, { editingReviewId, payload }),
    withdraw: (requestId: string, reason: string) => withdrawReviewRequest(context, requestId, reason),
    reject: (requestId: string, comment: string) => rejectReviewRequest(context, requestId, comment),
    updateStatus: (requestId: string, status: ReviewStatus) => updateReviewStatus(context, requestId, status),
    reopen: (requestId: string) => reopenReviewRequest(context, requestId),
    resubmit: (requestId: string, comment: string) => resubmitReviewRequest(context, requestId, comment),
    addFeedback: (requestId: string, comment: string) => addReviewFeedback(context, requestId, comment),
    updateFeedback: (feedbackId: string, comment: string) => updateReviewFeedback(context, feedbackId, comment),
    voidFeedback: (feedbackId: string, reason: string) => voidReviewFeedback(context, feedbackId, reason),
  }
}
