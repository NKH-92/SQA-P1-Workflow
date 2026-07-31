import { memo, useEffect, useState } from 'react'
import type { ReviewRequest, ReviewStatus } from '../../../types'
import { dueDateLabel, dueDateShortLabel, dueUrgency } from '../../../lib/dates'

const COLUMNS: Array<{ status: ReviewStatus; label: string }> = [
  { status: 'pending', label: '대기중' },
  { status: 'approved', label: '완료' },
  { status: 'rejected', label: '반려' },
]

const COLLAPSED_ITEM_COUNT = 3

function cardUrgency(request: ReviewRequest): 'urgent' | 'warning' | 'normal' {
  // 종결된 요청은 기한이 지났어도 긴급 표시하지 않는다.
  if (request.status !== 'pending') return 'normal'
  return dueUrgency(request.due_date)
}

/**
 * 검토요청 상태별 칸반 보드. 파트장이 대기/완료/반려 흐름을 한눈에 본다.
 * 카드 클릭은 목록과 동일하게 상세를 선택한다(상태 변경은 상세에서 수행).
 */
export const ReviewKanban = memo(function ReviewKanban({
  requests,
  selectedReviewId,
  onSelectReview,
}: {
  requests: ReviewRequest[]
  selectedReviewId: string | null
  onSelectReview: (id: string) => void
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
      {COLUMNS.map((column) => {
        const items = requests.filter((request) => request.status === column.status)
        const isExpanded = expanded[column.status]
        const visibleItems = isExpanded ? items : items.slice(0, COLLAPSED_ITEM_COUNT)
        return (
          <section className="kanban-col" data-status={column.status} key={column.status}>
            <div className="kanban-col-head">
              <strong>{column.label}</strong>
              <span className="count">{items.length}</span>
            </div>
            {items.length === 0 && <p className="kanban-col-empty">항목이 없습니다.</p>}
            {visibleItems.map((request) => {
              const urgency = cardUrgency(request)
              const dueClass = urgency === 'normal' ? '' : urgency
              return (
                <button
                  aria-pressed={selectedReviewId === request.id}
                  className={selectedReviewId === request.id ? 'kanban-card selected' : 'kanban-card'}
                  data-urgency={urgency}
                  key={request.id}
                  onClick={() => onSelectReview(request.id)}
                  type="button"
                >
                  <div className={`kanban-card-tag${dueClass ? ` ${dueClass}` : ''}`}>
                    {request.due_date ? dueDateLabel(request.due_date) : '기한 없음'}
                  </div>
                  <div className="kanban-card-title">{request.title}</div>
                  <div className="kanban-card-meta">
                    <span className="kanban-card-req">
                      <span className="kanban-card-avatar" aria-hidden="true">
                        {request.profiles?.name?.trim().charAt(0) || '?'}
                      </span>
                      <span>{request.profiles?.name ?? '요청자'}</span>
                    </span>
                    {request.due_date && (
                      <span className={`kanban-card-due${dueClass ? ` ${dueClass}` : ''}`}>
                        {dueDateShortLabel(request.due_date)}
                      </span>
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
                  setExpanded((current) => ({ ...current, [column.status]: !current[column.status] }))
                }
                type="button"
              >
                {isExpanded ? '접기' : `나머지 ${items.length - COLLAPSED_ITEM_COUNT}개 보기`}
              </button>
            )}
          </section>
        )
      })}
    </div>
  )
})
