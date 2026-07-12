import { useEffect, useState } from 'react'
import type { ReviewRequest } from '../../types'

export function useReviewSelection(
  visibleReviewRequests: ReviewRequest[],
  scopedReviewRequests: ReviewRequest[],
  initialSelectedId?: string | null,
  onInitialSelectionApplied?: () => void,
) {
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null)
  const [selectedReviewSnapshot, setSelectedReviewSnapshot] = useState<ReviewRequest | null>(null)
  const firstVisibleReviewId = visibleReviewRequests[0]?.id ?? null
  const visibleReviewKey = visibleReviewRequests.map((request) => request.id).join('|')
  // 칸반 카드·딥링크는 필터 밖 요청을 가리킬 수 있다. 호출부가 필터를 풀어주는 동안의
  // 프레임에도 엉뚱한 요청이 아닌 선택한 요청을 보여주도록 scoped까지 폴백한다.
  const selectedReview =
    visibleReviewRequests.find((request) => request.id === selectedReviewId) ??
    scopedReviewRequests.find((request) => request.id === selectedReviewId) ??
    (selectedReviewSnapshot?.id === selectedReviewId ? selectedReviewSnapshot : null) ??
    visibleReviewRequests[0] ??
    null

  useEffect(() => {
    if (!firstVisibleReviewId) {
      if (selectedReviewId !== null && selectedReviewSnapshot?.id !== selectedReviewId) setSelectedReviewId(null)
      return
    }
    if (
      !visibleReviewRequests.some((request) => request.id === selectedReviewId) &&
      !scopedReviewRequests.some((request) => request.id === selectedReviewId) &&
      selectedReviewSnapshot?.id !== selectedReviewId
    ) {
      setSelectedReviewId(firstVisibleReviewId)
    }
  }, [firstVisibleReviewId, selectedReviewId, selectedReviewSnapshot, scopedReviewRequests, visibleReviewKey, visibleReviewRequests])

  useEffect(() => {
    if (!initialSelectedId) return
    const target = scopedReviewRequests.find((request) => request.id === initialSelectedId)
    if (!target) return
    setSelectedReviewSnapshot(target)
    setSelectedReviewId(target.id)
    onInitialSelectionApplied?.()
  }, [initialSelectedId, onInitialSelectionApplied, scopedReviewRequests])

  return { selectedReviewId, setSelectedReviewId, selectedReview }
}
