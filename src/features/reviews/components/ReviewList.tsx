import { memo } from 'react'
import { Inbox } from 'lucide-react'
import { EmptyState } from '../../../components/ui'
import type { Profile, ReviewRequest, ReviewStatus } from '../../../types'
import type { ReviewStatusFilter } from '../../../app/types'
import { dueDateShortLabel, dueDateStatus, relativeDateLabel } from '../../../lib/dates'
import { formatDate, reviewStatusLabels } from '../../../lib/format'
import { canViewTeamData } from '../../../domain/permissions'

type ReviewListProps = {
  profile: Profile
  visibleReviewRequests: ReviewRequest[]
  scopedReviewRequests: ReviewRequest[]
  statusCounts: Record<ReviewStatus, number>
  statusFilter: ReviewStatusFilter
  onStatusFilterChange: (filter: ReviewStatusFilter) => void
  selectedReviewId: string | null
  onSelectReview: (id: string) => void
  unreadIds?: Set<string>
  loading?: boolean
}

function dueChipTone(dueStatus: ReturnType<typeof dueDateStatus>) {
  if (dueStatus === 'overdue' || dueStatus === 'due_now') return 'hot'
  if (dueStatus === 'due_soon') return 'soon'
  return undefined
}

export const ReviewList = memo(function ReviewList({
  profile,
  visibleReviewRequests,
  scopedReviewRequests,
  statusCounts,
  statusFilter,
  onStatusFilterChange,
  selectedReviewId,
  onSelectReview,
  unreadIds,
  loading = false,
}: ReviewListProps) {
  const leaderMode = canViewTeamData(profile)
  return (
    <aside className="review-list-pane" aria-label="검토요청 목록">
      <div className="review-list-head">
        <h2>{leaderMode ? '검토요청' : '내 검토요청'}</h2>
        <span>{visibleReviewRequests.length}건</span>
      </div>
      <div className="review-filter-row" role="group" aria-label="검토요청 상태 필터">
        <button
          aria-pressed={statusFilter === 'all'}
          className={statusFilter === 'all' ? 'filter-chip selected' : 'filter-chip'}
          onClick={() => onStatusFilterChange('all')}
          type="button"
        >
          전체 {leaderMode ? scopedReviewRequests.length : scopedReviewRequests.length - statusCounts.withdrawn}
        </button>
        {(Object.entries(reviewStatusLabels) as Array<[ReviewStatus, string]>)
          .filter(([value]) => leaderMode || value !== 'withdrawn')
          .map(([value, label]) => (
          <button
            aria-pressed={statusFilter === value}
            className={statusFilter === value ? 'filter-chip selected' : 'filter-chip'}
            key={value}
            onClick={() => onStatusFilterChange(value)}
            type="button"
          >
            {label} {statusCounts[value]}
          </button>
        ))}
      </div>
      {loading && <p className="empty-copy" role="status">회수 보관함을 불러오는 중입니다.</p>}
      {!loading && visibleReviewRequests.length === 0 && (
        <EmptyState
          icon={<Inbox size={22} />}
          title={statusFilter === 'withdrawn' ? '회수된 검토요청이 없습니다.' : '검토요청이 없습니다.'}
          description={statusFilter === 'withdrawn'
            ? leaderMode
              ? '최근 7일 동안 회수된 요청이 여기에 표시됩니다.'
              : '최근 90일 동안 회수된 요청이 여기에 표시됩니다.'
            : '검색어나 필터를 바꾸면 다른 요청이 보입니다.'}
        />
      )}
      {visibleReviewRequests.map((request) => {
        const dueStatus = dueDateStatus(request.due_date)
        const dueChip = request.status === 'pending' ? dueDateShortLabel(request.due_date) : null
        const unread = unreadIds?.has(request.id) ?? false
        const reviewRound = request.review_round ?? 1
        const submittedAt = reviewRound > 1
          ? request.last_submitted_at ?? request.created_at
          : request.created_at
        return (
          <button
            aria-pressed={selectedReviewId === request.id}
            className={selectedReviewId === request.id ? 'review-list-item selected' : 'review-list-item'}
            data-status={request.status}
            key={request.id}
            onClick={() => onSelectReview(request.id)}
            type="button"
          >
            <span className="review-list-line1">
              {unread && <span className="unread-dot" role="img" aria-label="새 소식" />}
              <strong>{request.title}</strong>
              {dueChip && (
                <span className="due-chip" data-tone={dueChipTone(dueStatus)}>
                  {dueChip}
                </span>
              )}
            </span>
            <span className="review-list-line2">
              <span className="status-word" data-status={request.status}>
                {request.status === 'pending' && reviewRound > 1
                  ? '재검토 요청'
                  : reviewStatusLabels[request.status]}
              </span>
              <span className="dot-sep" aria-hidden="true" />
              {request.profiles?.name ?? '요청자'}
              <span className="dot-sep" aria-hidden="true" />
              <time title={formatDate(submittedAt)}>{relativeDateLabel(submittedAt)}</time>
            </span>
          </button>
        )
      })}
    </aside>
  )
})
