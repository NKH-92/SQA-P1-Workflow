import { useEffect, useRef, useState } from 'react'
import type { ReviewRequest } from '../../types'

type SelectionState = readonly [string | null, (value: string | null) => void]

/**
 * 상세에 보일 검토요청. 딥링크(initialSelectedId)가 먼저이고, 그다음 사용자가 고른 요청,
 * 둘 다 목록에 없으면 첫 요청을 고른다. selectionState를 넘기면 그 저장소(예: 세션 보기 상태)를 쓴다.
 */
export function useReviewSelection(
  visibleReviewRequests: ReviewRequest[],
  initialSelectedId?: string | null,
  onInitialSelectionApplied?: () => void,
  selectionState?: SelectionState,
) {
  const internalState = useState<string | null>(null)
  const [selectedReviewId, setSelectedReviewId] = selectionState ?? internalState
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
  }, [resolvedSelectedReviewId, selectedReviewId, setSelectedReviewId, visibleReviewKey])

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
  }, [initialSelectedId, initialSelectedReview, onInitialSelectionApplied, setSelectedReviewId, visibleReviewKey])

  return { selectedReviewId: resolvedSelectedReviewId, setSelectedReviewId, selectedReview }
}
