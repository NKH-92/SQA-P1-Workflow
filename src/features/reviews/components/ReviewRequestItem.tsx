import { useEffect, useRef, useState } from 'react'
import { Badge, CopyLinkButton } from '../../../components/ui'
import type { Profile, ReviewRequest, ReviewStatus } from '../../../types'
import { resolveAttachmentHref } from '../../../lib/attachments'
import { ageInDays, dueDateLabel, dueDateShortLabel, dueUrgency } from '../../../lib/dates'
import { formatDate, reviewStatusLabels } from '../../../lib/format'
import {
  Check,
  Paperclip,
  Pencil,
  Send,
  Trash2,
  X,
} from 'lucide-react'

const statusActions: Array<{ status: ReviewStatus; label: string; variant: string }> = [
  { status: 'pending', label: '대기중', variant: '' },
  { status: 'rejected', label: '반려', variant: 'reject' },
  { status: 'approved', label: '완료 처리', variant: 'approve' },
]

type TimelineStepState = 'complete' | 'current' | 'waiting'

function getTimelineSteps(status: ReviewStatus) {
  return [
    { key: 'pending', label: reviewStatusLabels.pending },
    {
      key: 'outcome',
      label: status === 'rejected' ? reviewStatusLabels.rejected : reviewStatusLabels.approved,
    },
  ] as const
}

function getTimelineStepState(index: number, status: ReviewStatus): TimelineStepState {
  if (status === 'pending') return index === 0 ? 'current' : 'waiting'
  if (status === 'approved') return 'complete'
  return index === 0 ? 'complete' : 'current'
}

function renderTimelineStepIcon(index: number, status: ReviewStatus, state: TimelineStepState) {
  if (state === 'complete') return <Check size={12} />
  if (status === 'rejected' && index === 1) return <X size={12} />
  return index + 1
}

export function ReviewRequestItem({
  addFeedback,
  onEdit,
  onWithdraw,
  pendingWithdraw,
  profile,
  rejectReview,
  reopenReview,
  resubmitReview,
  updateFeedback,
  deleteFeedback,
  request,
  updateStatus,
  withdrawReview,
}: {
  addFeedback: (requestId: string, comment: string) => Promise<boolean>
  onEdit: (request: ReviewRequest) => void
  onWithdraw: (requestId: string | null) => void
  pendingWithdraw: boolean
  profile: Profile
  rejectReview: (requestId: string, comment: string) => Promise<boolean>
  reopenReview: (requestId: string) => Promise<boolean>
  resubmitReview: (requestId: string, comment: string) => Promise<boolean>
  updateFeedback: (feedbackId: string, comment: string) => Promise<boolean>
  deleteFeedback: (feedbackId: string) => Promise<boolean>
  request: ReviewRequest
  updateStatus: (id: string, status: ReviewStatus) => Promise<boolean>
  withdrawReview: (requestId: string) => void
}) {
  const [attachmentHref, setAttachmentHref] = useState<string | null>(null)
  const [transitionNotice, setTransitionNotice] = useState<{ text: string; tone: ReviewStatus } | null>(null)
  const [rejectNotice, setRejectNotice] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const [editingFeedbackId, setEditingFeedbackId] = useState<string | null>(null)
  const [editingFeedbackText, setEditingFeedbackText] = useState('')
  const [feedbackDraft, setFeedbackDraft] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const feedbackInputRef = useRef<HTMLTextAreaElement>(null)
  const timelineSteps = getTimelineSteps(request.status)
  const requestFeedback = request.review_feedback ?? []
  const ownsRequest = profile.id === request.requester_id
  const canEditOwn = ownsRequest && (request.status === 'pending' || request.status === 'rejected')
  const canWithdrawOwn = ownsRequest && request.status === 'pending'
  const isMemberResubmission = profile.role === 'member' && ownsRequest && request.status === 'rejected'
  const reviewRound = request.review_round ?? 1
  const rejectionCount = request.rejection_count ?? (request.status === 'rejected' ? 1 : 0)
  const statusLabel = request.status === 'pending' && reviewRound > 1
    ? '재검토 요청'
    : reviewStatusLabels[request.status]
  const urgency = dueUrgency(request.due_date)
  const dueUrgent = urgency === 'urgent'

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

  const withSubmitting = async <T,>(operation: () => Promise<T>): Promise<T> => {
    setIsSubmitting(true)
    try {
      return await operation()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStatusTransition = async (status: ReviewStatus) => {
    if (status === request.status || isSubmitting) return
    if (status === 'rejected') {
      if (!feedbackDraft.trim()) {
        setRejectNotice(true)
        feedbackInputRef.current?.focus()
        return
      }
      if (!window.confirm('이 검토요청을 반려 처리하시겠습니까?')) return
      setRejectNotice(false)
      const ok = await withSubmitting(() => rejectReview(request.id, feedbackDraft))
      if (!ok) return
      setFeedbackDraft('')
      setTransitionNotice({ text: '반려 상태로 전환했습니다.', tone: status })
      window.setTimeout(() => setTransitionNotice(null), 2600)
      return
    }
    if (!window.confirm('이 검토요청을 완료 처리하시겠습니까?')) return
    const ok = await withSubmitting(() => updateStatus(request.id, status))
    if (!ok) return
    setTransitionNotice({ text: `${reviewStatusLabels[status]} 상태로 전환했습니다.`, tone: status })
    if (status === 'approved') {
      setCelebrate(true)
      window.setTimeout(() => setCelebrate(false), 1400)
    }
    window.setTimeout(() => setTransitionNotice(null), 2600)
  }

  const handleReopen = async () => {
    if (isSubmitting) return
    if (!window.confirm('종결된 검토요청을 다시 대기 상태로 되돌리시겠습니까?')) return
    await withSubmitting(() => reopenReview(request.id))
  }

  const submitFeedback = async () => {
    if (isSubmitting || !feedbackDraft.trim()) return
    const submittedComment = feedbackDraft
    if (isMemberResubmission && !window.confirm('피드백을 남기고 같은 검토요청으로 재검토를 요청하시겠습니까?')) {
      return
    }
    setIsSubmitting(true)
    try {
      const ok = isMemberResubmission
        ? await resubmitReview(request.id, submittedComment)
        : await addFeedback(request.id, submittedComment)
      if (ok) {
        setFeedbackDraft((current) => (current === submittedComment ? '' : current))
        if (isMemberResubmission) {
          setTransitionNotice({ text: '같은 검토요청으로 재검토를 요청했습니다.', tone: 'pending' })
          window.setTimeout(() => setTransitionNotice(null), 2600)
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const startFeedbackEdit = (feedbackId: string, comment: string) => {
    setEditingFeedbackId(feedbackId)
    setEditingFeedbackText(comment)
  }

  const saveFeedbackEdit = async () => {
    if (!editingFeedbackId || !editingFeedbackText.trim()) return
    const ok = await withSubmitting(() => updateFeedback(editingFeedbackId!, editingFeedbackText))
    if (ok) {
      setEditingFeedbackId(null)
      setEditingFeedbackText('')
    }
  }

  const removeFeedback = async (feedbackId: string) => {
    if (!window.confirm('이 피드백을 삭제하시겠습니까?')) return
    await withSubmitting(() => deleteFeedback(feedbackId))
  }

  return (
    <article className="request-item">
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
        <Badge status={request.status}>{statusLabel}</Badge>
        {rejectionCount > 0 && <span className="review-history-chip">반려 이력 {rejectionCount}회</span>}
        <span className="request-meta-inline">
          {request.profiles?.name ?? '요청자'} · 접수 {ageInDays(request.created_at)}일
        </span>
        {request.status === 'pending' && request.due_date && (
          <span className="due-chip" data-tone={dueUrgent ? 'hot' : urgency === 'warning' ? 'soon' : undefined}>
            {dueDateShortLabel(request.due_date)}
          </span>
        )}
        {request.attachment_url && <Paperclip size={14} aria-label="첨부 있음" />}
        {profile.role === 'leader' && request.status === 'pending' && (
          <div className="request-actions">
            <span role="group" aria-label="검토 상태 전환" style={{ display: 'contents' }}>
              {statusActions.map(({ status, label, variant }) => (
                <button
                  className={variant ? `status-btn ${variant}` : 'status-btn'}
                  disabled={request.status === status || isSubmitting}
                  key={status}
                  onClick={() => handleStatusTransition(status)}
                  type="button"
                >
                  {request.status === status && <Check size={13} />}
                  {label}
                </button>
              ))}
            </span>
            <CopyLinkButton tab="reviews" entityId={request.id} />
          </div>
        )}
        {canEditOwn && (
          <div className="request-actions">
            <button className="ghost compact" onClick={() => onEdit(request)} type="button">
              <Pencil size={14} />
              수정
            </button>
            {canWithdrawOwn && pendingWithdraw ? (
              <>
                <button className="danger compact" onClick={() => void withdrawReview(request.id)} type="button">
                  회수 확인
                </button>
                <button className="ghost compact" onClick={() => onWithdraw(null)} type="button">
                  취소
                </button>
              </>
            ) : canWithdrawOwn ? (
              <button className="ghost compact" onClick={() => onWithdraw(request.id)} type="button">
                <Trash2 size={14} />
                회수
              </button>
            ) : null}
            <CopyLinkButton tab="reviews" entityId={request.id} />
          </div>
        )}
        {profile.role === 'leader' && (request.status === 'approved' || request.status === 'rejected') && (
          <div className="request-actions">
            <button className="ghost compact" disabled={isSubmitting} onClick={() => void handleReopen()} type="button">
              다시 열기
            </button>
            <CopyLinkButton tab="reviews" entityId={request.id} />
          </div>
        )}
        {!(profile.role === 'leader' && request.status === 'pending') &&
          !(profile.role === 'leader' && (request.status === 'approved' || request.status === 'rejected')) &&
          !canEditOwn && (
          <div className="request-actions">
            <CopyLinkButton tab="reviews" entityId={request.id} />
          </div>
        )}
      </div>

      <h1 className="request-title">{request.title}</h1>

      <div className="request-meta-grid">
        <div>
          <span>요청자</span>
          <strong>
            {request.profiles?.name ?? '요청자'}
          </strong>
        </div>
        <div>
          <span>{reviewRound > 1 ? '최종 재요청' : '요청일'}</span>
          <strong>{formatDate(request.last_submitted_at ?? request.created_at)}</strong>
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
        {timelineSteps.map((step, index) => {
          const state = getTimelineStepState(index, request.status)
          return (
            <div className={`status-step ${state}`} key={step.key}>
              <span>{renderTimelineStepIcon(index, request.status, state)}</span>
              <small>{step.label}</small>
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
                  {item.profiles?.name ?? ((item.author_role ?? 'leader') === 'leader' ? '파트장' : '파트원')}
                  {' · '}{(item.author_role ?? 'leader') === 'leader' ? '파트장' : '파트원'}
                  {' · '}{formatDate(item.created_at)}
                </span>
                {editingFeedbackId === item.id ? (
                  <div className="feedback-edit-form">
                    <textarea
                      aria-label="피드백 수정"
                      value={editingFeedbackText}
                      onChange={(event) => setEditingFeedbackText(event.target.value)}
                    />
                    <div className="feedback-edit-actions">
                      <button className="primary compact" disabled={isSubmitting} onClick={() => void saveFeedbackEdit()} type="button">
                        저장
                      </button>
                      <button className="ghost compact" onClick={() => setEditingFeedbackId(null)} type="button">
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p>{item.comment}</p>
                    {profile.role === 'leader' &&
                      (item.author_role ?? 'leader') === 'leader' &&
                      item.leader_id === profile.id && (
                      <div className="feedback-actions">
                        <button className="ghost compact" onClick={() => startFeedbackEdit(item.id, item.comment)} type="button">
                          수정
                        </button>
                        <button className="ghost compact" disabled={isSubmitting} onClick={() => void removeFeedback(item.id)} type="button">
                          삭제
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        {(profile.role === 'leader' || isMemberResubmission) && (
          <div className="feedback-composer">
            <div className="feedback-composer-head">
              <strong>{profile.name}</strong>
              {isMemberResubmission && <span>반려 피드백을 반영한 내용을 남기면 이 요청이 다시 파트장에게 전달됩니다.</span>}
            </div>
            <textarea
              maxLength={2000}
              disabled={isSubmitting}
              ref={feedbackInputRef}
              placeholder={isMemberResubmission
                ? '수정한 내용과 확인받을 사항을 파트장에게 알려주세요.'
                : '이 검토요청에 대해 어떻게 생각하시나요?'}
              value={feedbackDraft}
              onChange={(event) => {
                setFeedbackDraft(event.target.value)
                if (rejectNotice) setRejectNotice(false)
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  void submitFeedback()
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
                disabled={isSubmitting || !feedbackDraft.trim()}
                onClick={() => void submitFeedback()}
                type="button"
              >
                <Send size={14} />
                {isMemberResubmission ? '피드백 작성 후 재검토 요청' : '피드백 남기기'}
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
        </div>
      )}
    </article>
  )
}
