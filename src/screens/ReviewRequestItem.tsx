import { useEffect, useState } from 'react'
import { Badge } from '../components/ui'
import type { Profile, ReviewRequest, ReviewStatus } from '../types'
import { resolveAttachmentHref } from '../lib/attachments'
import { ageInDays, dueDateLabel, dueDateStatus } from '../lib/dates'
import { formatDate, reviewStatusLabels } from '../lib/format'
import {
  Check,
  Pencil,
  Save,
  Trash2,
} from 'lucide-react'

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
  const statusButtons = Object.entries(reviewStatusLabels) as Array<[ReviewStatus, string]>
  const canEditOwn = profile.id === request.requester_id && request.status === 'pending'

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
      <div className="request-main">
        <div>
          <strong>{request.title}</strong>
          <span>
            {request.profiles?.name ?? '요청자'} · {formatDate(request.created_at)} · 접수 {ageInDays(request.created_at)}일
          </span>
        </div>
        <Badge status={request.status}>{reviewStatusLabels[request.status]}</Badge>
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
      {profile.role === 'leader' && (
        <div className="status-action-group" aria-label="검토 상태 전환">
          {statusButtons.map(([status, label]) => (
            <button
              className={request.status === status ? 'selected' : ''}
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
        <div className="inline-actions">
          <button className="ghost compact" onClick={() => onEdit(request)} type="button">
            <Pencil size={16} />
            수정
          </button>
          {pendingWithdraw ? (
            <div className="delete-confirm">
              <button className="danger compact" onClick={() => void withdrawReview(request.id)} type="button">
                회수 확인
              </button>
              <button className="ghost compact" onClick={() => onWithdraw(null)} type="button">
                취소
              </button>
            </div>
          ) : (
            <button className="ghost compact" onClick={() => onWithdraw(request.id)} type="button">
              <Trash2 size={16} />
              회수
            </button>
          )}
        </div>
      )}
      <div className="request-meta-row">
        <Badge status={dueDateStatus(request.due_date)}>
          {request.due_date ? `${dueDateLabel(request.due_date)} · ${formatDate(request.due_date)}` : '기한 없음'}
        </Badge>
      </div>
      <p>{request.description}</p>
      {attachmentHref && (
        <a href={attachmentHref} target="_blank" rel="noreferrer">
          첨부 열기
        </a>
      )}
      <div className="feedback-list">
        {requestFeedback.map((item, index) => (
          <div className={index === requestFeedback.length - 1 ? 'feedback feedback-new' : 'feedback'} key={item.id}>
            <span>{item.profiles?.name ?? '파트장'} · {formatDate(item.created_at)}</span>
            <p>{item.comment}</p>
          </div>
        ))}
      </div>
      {profile.role === 'leader' && (
        <div className="inline-form">
          <input
            placeholder="피드백 작성"
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
          <button className="primary compact" onClick={() => void addFeedback(request.id)} type="button">
            <Save size={16} />
            저장
          </button>
        </div>
      )}
      {rejectNotice && <p className="notice error">반려하려면 피드백에 사유를 먼저 입력해 주세요.</p>}
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

