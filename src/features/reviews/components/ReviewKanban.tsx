import type { ReviewRequest, ReviewStatus } from '../../../types'
import { dueDateLabel, dueDateShortLabel, dueDateStatus } from '../../../lib/dates'

const COLUMNS: Array<{ status: ReviewStatus; label: string }> = [
  { status: 'pending', label: '대기중' },
  { status: 'approved', label: '완료' },
  { status: 'rejected', label: '반려' },
]

function cardUrgency(request: ReviewRequest): 'urgent' | 'warning' | 'normal' {
  if (request.status !== 'pending') return 'normal'
  const status = dueDateStatus(request.due_date)
  if (status === 'overdue' || status === 'due_now') return 'urgent'
  if (status === 'due_soon') return 'warning'
  return 'normal'
}

/**
 * 검토요청 상태별 칸반 보드. 파트장이 대기/완료/반려 흐름을 한눈에 본다.
 * 카드 클릭은 목록과 동일하게 상세를 선택한다(상태 변경은 상세에서 수행).
 */
export function ReviewKanban({
  requests,
  selectedReviewId,
  onSelectReview,
}: {
  requests: ReviewRequest[]
  selectedReviewId: string | null
  onSelectReview: (id: string) => void
}) {
  return (
    <div className="kanban">
      {COLUMNS.map((column) => {
        const items = requests.filter((request) => request.status === column.status)
        return (
          <section className="kanban-col" data-status={column.status} key={column.status}>
            <div className="kanban-col-head">
              <strong>{column.label}</strong>
              <span className="count">{items.length}</span>
            </div>
            {items.length === 0 && <p className="kanban-col-empty">항목이 없습니다.</p>}
            {items.map((request) => {
              const urgency = cardUrgency(request)
              const dueClass = urgency === 'normal' ? '' : urgency
              return (
                <button
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
          </section>
        )
      })}
    </div>
  )
}
