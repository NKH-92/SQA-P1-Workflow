import { useEffect, useState } from 'react'
import type { ReviewRequest } from '../../types'

export function useReviewSelection(
  visibleReviewRequests: ReviewRequest[],
  scopedReviewRequests: ReviewRequest[],
  initialSelectedId?: string | null,
  onInitialSelectionApplied?: () => void,
) {
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null)
  const firstVisibleReviewId = visibleReviewRequests[0]?.id ?? null
  const visibleReviewKey = visibleReviewRequests.map((request) => request.id).join('|')
  const selectedReview =
    visibleReviewRequests.find((request) => request.id === selectedReviewId) ?? visibleReviewRequests[0] ?? null

  useEffect(() => {
    if (!firstVisibleReviewId) {
      if (selectedReviewId !== null) setSelectedReviewId(null)
      return
    }
    if (!visibleReviewRequests.some((request) => request.id === selectedReviewId)) {
      setSelectedReviewId(firstVisibleReviewId)
    }
  }, [firstVisibleReviewId, selectedReviewId, visibleReviewKey, visibleReviewRequests])

  useEffect(() => {
    if (!initialSelectedId) return
    if (!scopedReviewRequests.some((request) => request.id === initialSelectedId)) return
    setSelectedReviewId(initialSelectedId)
    onInitialSelectionApplied?.()
  }, [initialSelectedId, onInitialSelectionApplied, scopedReviewRequests])

  return { selectedReviewId, setSelectedReviewId, selectedReview }
}
