import type { Ref } from 'react'
import { MousePointerClick } from 'lucide-react'
import { EmptyState } from '../../../components/ui'
import type { Profile, ReviewEvent, ReviewRequest, ReviewStatus } from '../../../types'
import { ReviewEventHistory } from './ReviewEventHistory'
import { ReviewRequestItem } from './ReviewRequestItem'

type ReviewDetailProps = {
  detailRef?: Ref<HTMLDivElement>
  profile: Profile
  selectedReview: ReviewRequest | null
  pendingWithdrawId: string | null
  localEvents?: ReviewEvent[]
  onEdit: (request: ReviewRequest) => void
  onWithdraw: (id: string | null) => void
  withdrawReview: (requestId: string) => void
  rejectReview: (requestId: string, comment: string) => Promise<boolean>
  reopenReview: (requestId: string) => Promise<boolean>
  resubmitReview: (requestId: string, comment: string) => Promise<boolean>
  updateFeedback: (feedbackId: string, comment: string) => Promise<boolean>
  voidFeedback: (feedbackId: string, reason: string) => Promise<boolean>
  updateStatus: (id: string, status: ReviewStatus) => Promise<boolean>
  addFeedback: (requestId: string, comment: string) => Promise<boolean>
}

export function ReviewDetail({
  detailRef,
  profile,
  selectedReview,
  pendingWithdrawId,
  localEvents = [],
  onEdit,
  onWithdraw,
  withdrawReview,
  rejectReview,
  reopenReview,
  resubmitReview,
  updateFeedback,
  voidFeedback,
  updateStatus,
  addFeedback,
}: ReviewDetailProps) {
  return (
    <div
      aria-live="polite"
      className="review-detail-pane"
      data-review-id={selectedReview?.id}
      ref={detailRef}
    >
      {selectedReview ? (
        <>
          <ReviewRequestItem
            addFeedback={addFeedback}
            key={selectedReview.id}
            onEdit={onEdit}
            onWithdraw={onWithdraw}
            pendingWithdraw={pendingWithdrawId === selectedReview.id}
            profile={profile}
            rejectReview={rejectReview}
            reopenReview={reopenReview}
            resubmitReview={resubmitReview}
            updateFeedback={updateFeedback}
            voidFeedback={voidFeedback}
            request={selectedReview}
            updateStatus={updateStatus}
            withdrawReview={withdrawReview}
          />
          <ReviewEventHistory
            key={`history-${selectedReview.id}`}
            localEvents={localEvents}
            reviewRequestId={selectedReview.id}
          />
        </>
      ) : (
        <EmptyState
          icon={<MousePointerClick size={22} />}
          title="왼쪽 목록에서 검토요청을 선택하세요."
          description="제목을 클릭하면 상세 내용과 피드백 흐름이 여기에 열립니다."
        />
      )}
    </div>
  )
}
