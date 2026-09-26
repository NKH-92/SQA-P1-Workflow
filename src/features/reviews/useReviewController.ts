import { useMemo } from 'react'
import {
  addReviewFeedback,
  createRepositoryContext,
  fetchReviewHistoryPage,
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
import { resubmitReviewRequestWithEdits } from '../../data/mutations/reviews'
import type {
  AppData,
  Profile,
  ReviewHistoryCursor,
  ReviewHistoryFilters,
  ReviewStatus,
} from '../../types'
import type { AppDataUpdater } from '../../data/repositories/appDataUpdater'
import type { ReviewRequestPayload } from '../../data/contracts'

export function useReviewController(profile: Profile, data: AppData, setData: AppDataUpdater) {
  const context = useMemo(
    () => createRepositoryContext(profile, data, setData),
    [data, profile, setData],
  )

  return {
    async loadHistoryPage(filters: ReviewHistoryFilters, cursor: ReviewHistoryCursor | null) {
      const page = await fetchReviewHistoryPage(filters, cursor, data.reviewRequests)
      setData((current) => ({
        ...current,
        reviewRequests: mergeReviewRequests(current.reviewRequests, page.rows),
      }))
      return page
    },
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
    /** 반려된 요청을 고쳐서 같은 요청으로 다시 보낸다(내용 수정 + 재요청을 한 번에). */
    resubmitWithEdits: (requestId: string, payload: ReviewRequestPayload, comment: string) =>
      resubmitReviewRequestWithEdits(context, requestId, payload, comment),
    addFeedback: (requestId: string, comment: string) => addReviewFeedback(context, requestId, comment),
    updateFeedback: (feedbackId: string, comment: string) => updateReviewFeedback(context, feedbackId, comment),
    voidFeedback: (feedbackId: string, reason: string) => voidReviewFeedback(context, feedbackId, reason),
  }
}
