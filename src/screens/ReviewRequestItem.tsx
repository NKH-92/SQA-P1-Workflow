import { useEffect, useState } from 'react'
import { Badge } from '../components/ui'
import type { Profile, ReviewRequest, ReviewStatus } from '../types'
import { resolveAttachmentHref } from '../lib/attachments'
import { ageInDays, dueDateLabel, dueDateStatus } from '../lib/dates'
import { formatDate, reviewStatusLabels } from '../lib/format'
import {
  Check,
  Paperclip,
  Pencil,
  Send,
  Trash2,
} from 'lucide-react'

const statusActions: Array<{ status: ReviewStatus; label: string; variant: string }> = [
  { status: 'pending', label: '대기중', variant: '' },
  { status: 'in_review', label: '검토 시작', variant: 'review' },
  { status: 'rejected', label: '반려', variant: 'reject' },
  { status: 'approved', label: '완료 처리', variant: 'approve' },
]

export function ReviewRequestItem({
  addFeedback,
  feedback,
  onEdit,
  onWithdraw,
  pendingWithdraw,
  profile,
  rejectReview,
  request,
  setFeedback,
  updateStatus,
  withdrawReview,
}: {
  addFeedback: (requestId: string) => void
  feedback: Record<string, string>
  onEdit: (request: ReviewRequest) => void
  onWithdraw: (requestId: string | null) => void
  pendingWithdraw: boolean
  profile: Profile
  rejectReview: (requestId: string) => void
  request: ReviewRequest
  setFeedback: React.Dispatch<React.SetStateAction<Record<string, string>>>
  updateStatus: (id: string, status: ReviewStatus) => void
  withdrawReview: (requestId: string) => void
}) {
  const [attachmentHref, setAttachmentHref] = useState<string | null>(null)
  const [transitionNotice, setTransitionNotice] = useState<{ text: string; tone: ReviewStatus; previousStatus?: ReviewStatus } | null>(null)
  const [rejectNotice, setRejectNotice] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const statusFlow: ReviewStatus[] = ['pending', 'in_review', 'approved']
  const currentStatusIndex = statusFlow.indexOf(request.status === 'rejected' ? 'in_review' : request.status)
  const requestFeedback = request.review_feedback ?? []
  const canEditOwn = profile.id === request.requester_id && request.status === 'pending'
  const dueStatus = dueDateStatus(request.due_date)
  const dueUrgent = dueStatus === 'overdue' || dueStatus === 'due_now'

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const href = await resolveAttachmentHref(request.attachment_url)
        if (active) setAttachmentHref(href)
      } catch {
        if (active) setAttachmentHref(null)
      }
    })()
    return () => {
      active = false
    }
  }, [request.attachment_url])

  const handleStatusTransition = (status: ReviewStatus) => {
    if (status === request.status) return
    if (status === 'rejected') {
      if (!(feedback[request.id]?.trim())) {
        setRejectNotice(true)
        return
      }
      setRejectNotice(false)
      void rejectReview(request.id)
      setTransitionNotice({ text: '반려 상태로 전환했습니다.', tone: status, previousStatus: request.status })
      window.setTimeout(() => setTransitionNotice(null), 2600)
      return
    }
    const previousStatus = request.status
    void updateStatus(request.id, status)
    setTransitionNotice({ text: `${reviewStatusLabels[status]} 상태로 전환했습니다.`, tone: status, previousStatus })
    if (status === 'approved') {
      setCelebrate(true)
      window.setTimeout(() => setCelebrate(false), 1400)
    }
    window.setTimeout(() => setTransitionNotice(null), 2600)
  }

  return (
    <article className={celebrate ? 'request-item is-celebrating' : 'request-item'}>
      {celebrate && (
        <div className="confetti-lite" aria-hidden="true">
          {Array.from({ length: 22 }).map((_, index) => (
            <span
              key={index}
              style={{
                animationDelay: `${index * 20}ms`,
                animationDuration: `${1000 + index * 30}ms`,
                height: `${6 + (index % 3) * 3}px`,
                left: `${8 + index * 4}%`,
                width: `${6 + (index % 3) * 3}px`,
              }}
            />
          ))}
        </div>
      )}

      <div className="request-topline">
        <Badge status={request.status}>{reviewStatusLabels[request.status]}</Badge>
        <span className="request-id">#{request.id.slice(0, 8).toUpperCase()}</span>
        <span className="request-age">접수 {ageInDays(request.created_at)}일</span>
        {profile.role === 'leader' && (
          <div className="request-actions" aria-label="검토 상태 전환">
            {statusActions.map(({ status, label, variant }) => (
              <button
                className={variant ? `status-btn ${variant}` : 'status-btn'}
                disabled={request.status === status}
                key={status}
                onClick={() => handleStatusTransition(status)}
                type="button"
              >
                {request.status === status && <Check size={13} />}
                {label}
              </button>
            ))}
          </div>
        )}
        {canEditOwn && (
          <div className="request-actions">
            <button className="ghost compact" onClick={() => onEdit(request)} type="button">
              <Pencil size={14} />
              수정
            </button>
            {pendingWithdraw ? (
              <>
                <button className="danger compact" onClick={() => void withdrawReview(request.id)} type="button">
                  회수 확인
                </button>
                <button className="ghost compact" onClick={() => onWithdraw(null)} type="button">
                  취소
                </button>
              </>
            ) : (
              <button className="ghost compact" onClick={() => onWithdraw(request.id)} type="button">
                <Trash2 size={14} />
                회수
              </button>
            )}
          </div>
        )}
      </div>

      <h1 className="request-title">{request.title}</h1>

      <div className="request-meta-grid">
        <div>
          <span>요청자</span>
          <strong>
            <span className="avatar-mark">{(request.profiles?.name ?? '요').slice(0, 1)}</span>
            {request.profiles?.name ?? '요청자'}
          </strong>
        </div>
        <div>
          <span>요청일</span>
          <strong>{formatDate(request.created_at)}</strong>
        </div>
        <div>
          <span>마감</span>
          <strong className={dueUrgent ? 'urgent' : undefined}>
            {request.due_date ? `${formatDate(request.due_date)} · ${dueDateLabel(request.due_date)}` : '기한 없음'}
          </strong>
        </div>
        <div>
          <span>첨부</span>
          <strong>
            {attachmentHref ? (
              <a href={attachmentHref} rel="noreferrer" target="_blank">
                <Paperclip size={13} />
                첨부 열기
              </a>
            ) : (
              '없음'
            )}
          </strong>
        </div>
      </div>

      <div className="status-timeline" data-status={request.status} aria-label="검토 상태 흐름">
        {statusFlow.map((status, index) => {
          const state = index < currentStatusIndex ? 'complete' : index === currentStatusIndex ? 'current' : 'waiting'
          return (
            <div className={`status-step ${state}`} key={status}>
              <span>{index < currentStatusIndex || request.status === 'approved' ? <Check size={12} /> : index + 1}</span>
              <small>{reviewStatusLabels[status]}</small>
            </div>
          )
        })}
      </div>

      <p className="request-description">{request.description}</p>

      <div className="feedback-block">
        <header>
          <h2>피드백</h2>
          <span>{requestFeedback.length}개</span>
        </header>
        {requestFeedback.length === 0 && <div className="feedback-empty">아직 피드백이 없습니다.</div>}
        {requestFeedback.length > 0 && (
          <div className="feedback-list">
            {requestFeedback.map((item, index) => (
              <div className={index === requestFeedback.length - 1 ? 'feedback feedback-new' : 'feedback'} key={item.id}>
                <span>
                  {item.profiles?.name ?? '파트장'} · {formatDate(item.created_at)}
                </span>
                <p>{item.comment}</p>
              </div>
            ))}
          </div>
        )}
        {profile.role === 'leader' && (
          <div className="feedback-composer">
            <div className="feedback-composer-head">
              <span className="avatar-mark">{profile.name.slice(0, 1)}</span>
              <strong>{profile.name}</strong>
            </div>
            <textarea
              placeholder="이 검토요청에 대해 어떻게 생각하시나요?"
              value={feedback[request.id] ?? ''}
              onChange={(event) => {
                setFeedback({ ...feedback, [request.id]: event.target.value })
                if (rejectNotice) setRejectNotice(false)
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  void addFeedback(request.id)
                }
              }}
            />
            <div className="feedback-composer-foot">
              <span className="modal-shortcut">
                <kbd>Ctrl</kbd>
                <kbd>Enter</kbd>
                저장
              </span>
              <button
                className="primary compact"
                disabled={!(feedback[request.id]?.trim())}
                onClick={() => void addFeedback(request.id)}
                type="button"
              >
                <Send size={14} />
                피드백 남기기
              </button>
            </div>
          </div>
        )}
        {rejectNotice && <p className="notice error">반려하려면 피드백에 사유를 먼저 입력해 주세요.</p>}
      </div>

      {transitionNotice && (
        <div className="interaction-toast" data-tone={transitionNotice.tone} role="status">
          <span />
          {transitionNotice.text}
          <button
            onClick={() => {
              if (transitionNotice.previousStatus) {
                void updateStatus(request.id, transitionNotice.previousStatus)
              }
              setTransitionNotice(null)
            }}
            type="button"
          >
            되돌리기
          </button>
        </div>
      )}
    </article>
  )
}
