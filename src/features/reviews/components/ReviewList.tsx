import { memo, useId } from 'react'
import { Inbox } from 'lucide-react'
import { EmptyState } from '../../../components/ui'
import type { Profile, ReviewRequest, ReviewStatus } from '../../../types'
import type { ReviewStatusFilter } from '../../../app/types'
import { dueState, relativeDateLabel } from '../../../lib/dates'
import { formatDate, formatDateTime, reviewStatusLabels } from '../../../lib/format'
import { canViewTeamData } from '../../../domain/permissions'
import {
  REVIEW_SORT_OPTIONS,
  isReviewSortMode,
  reviewDecisionLabel,
  reviewDecisionTimeMs,
  reviewRequestedAt,
  reviewStatusText,
  type ReviewSortMode,
} from '../reviewOrdering'

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
  /** 파트장 목록의 정렬. 넘기면 정렬 선택을 보여준다. */
  sortMode?: ReviewSortMode
  onSortModeChange?: (mode: ReviewSortMode) => void
  /** 요청별 승인·반려 기록 시각(처리 시점 표기용) */
  decisionEvents?: ReadonlyMap<string, number>
}

function dueChipTone(tone: 'urgent' | 'warning' | 'normal' | 'done') {
  if (tone === 'urgent') return 'hot'
  if (tone === 'warning') return 'soon'
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
  sortMode,
  onSortModeChange,
  decisionEvents,
}: ReviewListProps) {
  const leaderMode = canViewTeamData(profile)
  const sortId = useId()
  const showDecisionTime = sortMode === 'decided'
  return (
    <aside className="review-list-pane" aria-label="검토요청 목록">
      <div className="review-list-head">
        <span className="review-list-count">{visibleReviewRequests.length}건</span>
        {sortMode && onSortModeChange && (
          <label className="review-sort" htmlFor={sortId}>
            <span>정렬</span>
            <select
              id={sortId}
              onChange={(event) => {
                if (isReviewSortMode(event.target.value)) onSortModeChange(event.target.value)
              }}
              value={sortMode}
            >
              {REVIEW_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        )}
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
      {loading && <p className="empty-copy" role="status">회수 보관함을 불러오고 있어요.</p>}
      {!loading && visibleReviewRequests.length === 0 && (
        <EmptyState
          icon={<Inbox size={22} />}
          title={statusFilter === 'withdrawn' ? '회수한 검토요청이 없어요' : '검토요청이 없어요'}
          description={statusFilter === 'withdrawn'
            ? leaderMode
              ? '최근 7일 동안 회수한 요청이 여기에 보여요.'
              : '최근 90일 동안 회수한 요청이 여기에 보여요.'
            : '검색어나 필터를 바꿔 보세요.'}
        />
      )}
      {visibleReviewRequests.map((request) => {
        const due = request.status === 'pending' ? dueState(request.due_date) : null
        const unread = unreadIds?.has(request.id) ?? false
        const requestedAt = reviewRequestedAt(request)
        const decisionLabel = showDecisionTime ? reviewDecisionLabel(request, decisionEvents) : null
        const decisionTime = decisionLabel ? reviewDecisionTimeMs(request, decisionEvents) : null
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
              {due && due.kind !== 'none' && (
                <span className="due-chip" data-tone={dueChipTone(due.tone)}>
                  {due.shortLabel}
                </span>
              )}
            </span>
            <span className="review-list-line2">
              {decisionLabel ? (
                <span className="status-word" data-status={request.status}>
                  <time
                    dateTime={decisionTime == null ? undefined : new Date(decisionTime).toISOString()}
                    title={decisionTime == null ? undefined : formatDateTime(new Date(decisionTime).toISOString())}
                  >
                    {decisionLabel}
                  </time>
                </span>
              ) : (
                <span className="status-word" data-status={request.status}>
                  {reviewStatusText(request)}
                </span>
              )}
              <span className="dot-sep" aria-hidden="true" />
              {request.profiles?.name ?? '요청자'}
              {!decisionLabel && (
                <>
                  <span className="dot-sep" aria-hidden="true" />
                  <time title={formatDate(requestedAt)}>{relativeDateLabel(requestedAt)}</time>
                </>
              )}
            </span>
          </button>
        )
      })}
    </aside>
  )
})
