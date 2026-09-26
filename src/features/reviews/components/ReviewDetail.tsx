import type { Ref } from 'react'
import { MousePointerClick } from 'lucide-react'
import { EmptyState } from '../../../components/ui'
import type { Profile, ReviewEvent, ReviewRequest } from '../../../types'
import { ReviewEventHistory } from './ReviewEventHistory'
import { ReviewRequestItem, type ReviewRequestItemHandlers } from './ReviewRequestItem'

type ReviewDetailProps = ReviewRequestItemHandlers & {
  detailRef?: Ref<HTMLDivElement>
  profile: Profile
  selectedReview: ReviewRequest | null
  localEvents?: ReviewEvent[]
  readOnly?: boolean
  inlineConfirm?: boolean
  compact?: boolean
  onBackToList?: () => void
}

/**
 * 검토요청 상세 칸. 항목을 고를 때마다 칸 전체를 읽어 주지 않도록 aria-live를 두지 않고,
 * 필요한 곳(목록에서 고른 뒤 등)에서 제목(h2)으로 포커스를 옮긴다.
 */
export function ReviewDetail({
  detailRef,
  profile,
  selectedReview,
  localEvents = [],
  readOnly = false,
  inlineConfirm = false,
  compact = false,
  onBackToList,
  ...handlers
}: ReviewDetailProps) {
  return (
    <div
      className="review-detail-pane"
      data-review-id={selectedReview?.id}
      ref={detailRef}
    >
      {selectedReview ? (
        <ReviewRequestItem
          {...handlers}
          compact={compact}
          footer={(
            <ReviewEventHistory
              key={`history-${selectedReview.id}`}
              localEvents={localEvents}
              reviewRequestId={selectedReview.id}
            />
          )}
          inlineConfirm={inlineConfirm}
          key={selectedReview.id}
          onBackToList={onBackToList}
          profile={profile}
          readOnly={readOnly}
          request={selectedReview}
        />
      ) : (
        <EmptyState
          icon={<MousePointerClick size={22} />}
          title="목록에서 검토요청을 골라 주세요"
          description="요청을 누르면 내용과 피드백을 여기서 볼 수 있어요."
        />
      )}
    </div>
  )
}
