import type { Dispatch, SetStateAction } from 'react'
import { MousePointerClick } from 'lucide-react'
import { EmptyState } from '../../../components/ui'
import type { Profile, ReviewRequest, ReviewStatus } from '../../../types'
import { ReviewRequestItem } from '../../../screens/ReviewRequestItem'

type ReviewDetailProps = {
  profile: Profile
  selectedReview: ReviewRequest | null
  feedback: Record<string, string>
  setFeedback: Dispatch<SetStateAction<Record<string, string>>>
  pendingWithdrawId: string | null
  onEdit: (request: ReviewRequest) => void
  onWithdraw: (id: string | null) => void
  withdrawReview: (requestId: string) => void
  rejectReview: (requestId: string) => Promise<boolean>
  updateStatus: (id: string, status: ReviewStatus) => Promise<boolean>
  addFeedback: (requestId: string) => void
}

export function ReviewDetail({
  profile,
  selectedReview,
  feedback,
  setFeedback,
  pendingWithdrawId,
  onEdit,
  onWithdraw,
  withdrawReview,
  rejectReview,
  updateStatus,
  addFeedback,
}: ReviewDetailProps) {
  return (
    <div className="review-detail-pane" aria-live="polite">
      {selectedReview ? (
        <ReviewRequestItem
          addFeedback={addFeedback}
          feedback={feedback}
          key={selectedReview.id}
          onEdit={onEdit}
          onWithdraw={onWithdraw}
          pendingWithdraw={pendingWithdrawId === selectedReview.id}
          profile={profile}
          rejectReview={rejectReview}
          request={selectedReview}
          setFeedback={setFeedback}
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
