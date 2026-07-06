import { Badge } from '../../../components/ui'
import type { Profile, ReviewRequest, ReviewStatus } from '../../../types'
import type { ReviewStatusFilter } from '../../../app/types'
import { ageInDays, dueDateLabel, dueDateStatus } from '../../../lib/dates'
import { formatDate, reviewStatusLabels } from '../../../lib/format'

type ReviewListProps = {
  profile: Profile
  visibleReviewRequests: ReviewRequest[]
  scopedReviewRequests: ReviewRequest[]
  statusCounts: Record<ReviewStatus, number>
  statusFilter: ReviewStatusFilter
  onStatusFilterChange: (filter: ReviewStatusFilter) => void
  selectedReviewId: string | null
  onSelectReview: (id: string) => void
}

export function ReviewList({
  profile,
  visibleReviewRequests,
  scopedReviewRequests,
  statusCounts,
  statusFilter,
  onStatusFilterChange,
  selectedReviewId,
  onSelectReview,
}: ReviewListProps) {
  return (
    <aside className="review-list-pane" aria-label="검토요청 목록">
      <div className="review-list-head">
        <h2>{profile.role === 'leader' ? '검토요청' : '내 검토요청'}</h2>
        <span>{visibleReviewRequests.length}건</span>
      </div>
      <div className="review-filter-row" role="group" aria-label="검토요청 상태 필터">
        <button
          className={statusFilter === 'all' ? 'filter-chip selected' : 'filter-chip'}
          onClick={() => onStatusFilterChange('all')}
          type="button"
        >
          전체 {scopedReviewRequests.length}
        </button>
        {(Object.entries(reviewStatusLabels) as Array<[ReviewStatus, string]>).map(([value, label]) => (
          <button
            className={statusFilter === value ? 'filter-chip selected' : 'filter-chip'}
            key={value}
            onClick={() => onStatusFilterChange(value)}
            type="button"
          >
            {label} {statusCounts[value]}
          </button>
        ))}
      </div>
      {visibleReviewRequests.length === 0 && <p className="empty">검토요청이 없습니다.</p>}
      {visibleReviewRequests.map((request) => {
        const dueStatus = dueDateStatus(request.due_date)
        const dueHot = dueStatus === 'overdue' || dueStatus === 'due_now'
        return (
          <button
            className={selectedReviewId === request.id ? 'review-list-item selected' : 'review-list-item'}
            key={request.id}
            onClick={() => onSelectReview(request.id)}
            type="button"
          >
            <span className="review-list-top">
              <Badge status={request.status}>{reviewStatusLabels[request.status]}</Badge>
              <time>{formatDate(request.created_at)}</time>
            </span>
            <strong>{request.title}</strong>
            <span className="review-list-meta">
              {request.profiles?.name ?? '요청자'} · 접수 {ageInDays(request.created_at)}일
              {request.due_date && (
                <>
                  {' · '}
                  <span className={dueHot ? 'due-hot' : undefined}>{dueDateLabel(request.due_date)}</span>
                </>
              )}
            </span>
          </button>
        )
      })}
    </aside>
  )
}
