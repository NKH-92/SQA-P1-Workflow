import { MousePointerClick } from 'lucide-react'
import { EmptyState } from '../../../components/ui'
import type { Profile, ReviewRequest, ReviewStatus } from '../../../types'
import { ReviewRequestItem } from './ReviewRequestItem'

type ReviewDetailProps = {
  profile: Profile
  selectedReview: ReviewRequest | null
  pendingWithdrawId: string | null
  onEdit: (request: ReviewRequest) => void
  onWithdraw: (id: string | null) => void
  withdrawReview: (requestId: string) => void
  rejectReview: (requestId: string, comment: string) => Promise<boolean>
  reopenReview: (requestId: string) => Promise<boolean>
  resubmitReview: (requestId: string, comment: string) => Promise<boolean>
  updateFeedback: (feedbackId: string, comment: string) => Promise<boolean>
  deleteFeedback: (feedbackId: string) => Promise<boolean>
  updateStatus: (id: string, status: ReviewStatus) => Promise<boolean>
  addFeedback: (requestId: string, comment: string) => Promise<boolean>
}

export function ReviewDetail({
  profile,
  selectedReview,
  pendingWithdrawId,
  onEdit,
  onWithdraw,
  withdrawReview,
  rejectReview,
  reopenReview,
  resubmitReview,
  updateFeedback,
  deleteFeedback,
  updateStatus,
  addFeedback,
}: ReviewDetailProps) {
  return (
    <div className="review-detail-pane" aria-live="polite">
      {selectedReview ? (
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
          deleteFeedback={deleteFeedback}
          request={selectedReview}
          updateStatus={updateStatus}
          withdrawReview={withdrawReview}
        />
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
