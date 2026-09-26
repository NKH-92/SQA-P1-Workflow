import { memo, useEffect, useState } from 'react'
import type { ReviewRequest, ReviewStatus } from '../../../types'
import { dueState } from '../../../lib/dates'
import { formatMonthDay, reviewStatusLabels } from '../../../lib/format'
import { reviewDecisionLabel } from '../reviewOrdering'

const COLUMNS: ReviewStatus[] = ['pending', 'approved', 'rejected', 'withdrawn']

const COLLAPSED_ITEM_COUNT = 3

/**
 * 카드 윗줄의 한 가지 정보: 대기 중이면 기한 상태, 끝난 요청이면 언제 어떻게 끝났는지.
 * 끝난 요청에는 기한 경과를 보여주지 않고, 같은 기한을 두 번 쓰지 않는다.
 */
function cardTag(request: ReviewRequest, decisionEvents?: ReadonlyMap<string, number>) {
  if (request.status === 'pending') {
    const due = dueState(request.due_date)
    return { text: due.label, tone: due.tone === 'urgent' ? 'urgent' : due.tone === 'warning' ? 'warning' : '' }
  }
  if (request.status === 'withdrawn') {
    const day = formatMonthDay(request.withdrawn_at ?? request.closed_at)
    return { text: day ? `${day} ${reviewStatusLabels.withdrawn}` : reviewStatusLabels.withdrawn, tone: '' }
  }
  return {
    text: reviewDecisionLabel(request, decisionEvents) ?? reviewStatusLabels[request.status],
    tone: '',
  }
}

/**
 * 검토요청 상태별 칸반 보드. 파트장이 대기 중·승인·반려·회수 흐름을 한눈에 본다.
 * 카드 클릭은 목록과 동일하게 상세를 선택한다(상태 변경은 상세에서 수행).
 */
export const ReviewKanban = memo(function ReviewKanban({
  requests,
  selectedReviewId,
  onSelectReview,
  decisionEvents,
}: {
  requests: ReviewRequest[]
  selectedReviewId: string | null
  onSelectReview: (id: string) => void
  decisionEvents?: ReadonlyMap<string, number>
}) {
  const [expanded, setExpanded] = useState<Record<ReviewStatus, boolean>>({
    pending: false,
    approved: false,
    rejected: false,
    withdrawn: false,
  })

  useEffect(() => {
    if (!selectedReviewId) return
    const selected = requests.find((request) => request.id === selectedReviewId)
    if (!selected) return
    const statusItems = requests.filter((request) => request.status === selected.status)
    if (statusItems.findIndex((request) => request.id === selectedReviewId) < COLLAPSED_ITEM_COUNT) return
    setExpanded((current) => (current[selected.status] ? current : { ...current, [selected.status]: true }))
  }, [requests, selectedReviewId])

  return (
    <div className="kanban">
      {COLUMNS.map((status) => {
        const items = requests.filter((request) => request.status === status)
        const isExpanded = expanded[status]
        const visibleItems = isExpanded ? items : items.slice(0, COLLAPSED_ITEM_COUNT)
        return (
          <section aria-label={`${reviewStatusLabels[status]} ${items.length}건`} className="kanban-col" data-status={status} key={status}>
            <div className="kanban-col-head">
              <strong>{reviewStatusLabels[status]}</strong>
              <span className="count">{items.length}</span>
            </div>
            {items.length === 0 && <p className="kanban-col-empty">요청이 없어요</p>}
            {visibleItems.map((request) => {
              const tag = cardTag(request, decisionEvents)
              return (
                <button
                  aria-pressed={selectedReviewId === request.id}
                  className={selectedReviewId === request.id ? 'kanban-card selected' : 'kanban-card'}
                  data-urgency={tag.tone || 'normal'}
                  key={request.id}
                  onClick={() => onSelectReview(request.id)}
                  type="button"
                >
                  <div className={`kanban-card-tag${tag.tone ? ` ${tag.tone}` : ''}`}>{tag.text}</div>
                  <div className="kanban-card-title">{request.title}</div>
                  <div className="kanban-card-meta">
                    <span className="kanban-card-req">
                      <span className="kanban-card-avatar" aria-hidden="true">
                        {request.profiles?.name?.trim().charAt(0) || '?'}
                      </span>
                      <span>{request.profiles?.name ?? '요청자'}</span>
                    </span>
                    {request.status === 'pending' && (request.review_round ?? 1) > 1 && (
                      <span className="kanban-card-due">재요청</span>
                    )}
                  </div>
                </button>
              )
            })}
            {items.length > COLLAPSED_ITEM_COUNT && (
              <button
                aria-expanded={isExpanded}
                className="kanban-toggle"
                onClick={() =>
                  setExpanded((current) => ({ ...current, [status]: !current[status] }))
                }
                type="button"
              >
                {isExpanded ? '접기' : `나머지 ${items.length - COLLAPSED_ITEM_COUNT}건 보기`}
              </button>
            )}
          </section>
        )
      })}
    </div>
  )
})
