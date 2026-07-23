import { useEffect, useRef, useState } from 'react'
import type { ReviewRequest } from '../../types'

export function useReviewSelection(
  visibleReviewRequests: ReviewRequest[],
  initialSelectedId?: string | null,
  onInitialSelectionApplied?: () => void,
) {
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null)
  const appliedInitialIdRef = useRef<string | null>(null)
  const visibleReviewKey = visibleReviewRequests.map((request) => request.id).join('|')
  const initialSelectedReview = initialSelectedId
    ? visibleReviewRequests.find((request) => request.id === initialSelectedId) ?? null
    : null
  const selectedReview = initialSelectedReview
    ?? visibleReviewRequests.find((request) => request.id === selectedReviewId)
    ?? visibleReviewRequests[0]
    ?? null
  const resolvedSelectedReviewId = selectedReview?.id ?? null

  useEffect(() => {
    if (resolvedSelectedReviewId !== selectedReviewId) {
      setSelectedReviewId(resolvedSelectedReviewId)
    }
  }, [resolvedSelectedReviewId, selectedReviewId, visibleReviewKey])

  useEffect(() => {
    if (!initialSelectedId) {
      appliedInitialIdRef.current = null
      return
    }
    if (appliedInitialIdRef.current === initialSelectedId) return
    if (!initialSelectedReview) return
    appliedInitialIdRef.current = initialSelectedReview.id
    setSelectedReviewId(initialSelectedReview.id)
    onInitialSelectionApplied?.()
  }, [initialSelectedId, initialSelectedReview, onInitialSelectionApplied, visibleReviewKey])

  return { selectedReviewId: resolvedSelectedReviewId, setSelectedReviewId, selectedReview }
}
