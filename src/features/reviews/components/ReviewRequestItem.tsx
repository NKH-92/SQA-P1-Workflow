import { useRef, useState } from 'react'
import { Badge, CopyLinkButton, Modal, ReasonPromptModal } from '../../../components/ui'
import type { Profile, ReviewRequest, ReviewStatus } from '../../../types'
import { ageInDays, dueDateLabel, dueDateShortLabel } from '../../../lib/dates'
import { formatDate, reviewStatusLabels } from '../../../lib/format'
import {
  buildReviewRequestItemModel,
  type TimelineStepState,
} from '../reviewRequestItemModel'
import {
  Check,
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
  voidFeedback,
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
  voidFeedback: (feedbackId: string, reason: string) => Promise<boolean>
  request: ReviewRequest
  updateStatus: (id: string, status: ReviewStatus) => Promise<boolean>
  withdrawReview: (requestId: string) => void
}) {
  const [transitionNotice, setTransitionNotice] = useState<{ text: string; tone: ReviewStatus } | null>(null)
  const [rejectNotice, setRejectNotice] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const [editingFeedbackId, setEditingFeedbackId] = useState<string | null>(null)
  const [editingFeedbackText, setEditingFeedbackText] = useState('')
  const [feedbackDraft, setFeedbackDraft] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmAction, setConfirmAction] = useState<
    | { kind: 'approve' }
    | { kind: 'reject'; comment: string }
    | { kind: 'reopen' }
    | { kind: 'resubmit'; comment: string }
    | null
  >(null)
  const [voidFeedbackId, setVoidFeedbackId] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const feedbackInputRef = useRef<HTMLTextAreaElement>(null)
  const {
    timelineSteps,
    requestFeedback,
    canEditOwn,
    canWithdrawOwn,
    isMemberResubmission,
    reviewRound,
    rejectionCount,
    statusLabel,
    urgency,
    dueUrgent,
  } = buildReviewRequestItemModel(request, profile)

  const withSubmitting = async <T,>(operation: () => Promise<T>): Promise<T> => {
    setIsSubmitting(true)
    try {
      return await operation()
    } finally {
      setIsSubmitting(false)
    }
  }

  const performStatusTransition = async (status: ReviewStatus, comment?: string) => {
    if (status === request.status || isSubmitting) return
    if (status === 'rejected') {
      setRejectNotice(false)
      const ok = await withSubmitting(() => rejectReview(request.id, comment ?? feedbackDraft))
      if (!ok) return
      setFeedbackDraft((current) => (current === comment ? '' : current))
      setTransitionNotice({ text: '반려 상태로 전환했습니다.', tone: status })
      window.setTimeout(() => setTransitionNotice(null), 2600)
      return
    }
    const ok = await withSubmitting(() => updateStatus(request.id, status))
    if (!ok) return
    setTransitionNotice({ text: `${reviewStatusLabels[status]} 상태로 전환했습니다.`, tone: status })
    if (status === 'approved') {
      setCelebrate(true)
      window.setTimeout(() => setCelebrate(false), 1400)
    }
    window.setTimeout(() => setTransitionNotice(null), 2600)
  }

  const handleStatusTransition = (status: ReviewStatus) => {
    if (status === request.status || isSubmitting) return
    if (status === 'rejected') {
      const comment = feedbackDraft.trim()
      if (!comment) {
        setRejectNotice(true)
        feedbackInputRef.current?.focus()
        return
      }
      setConfirmAction({ kind: 'reject', comment })
      return
    }
    setConfirmAction({ kind: 'approve' })
  }

  const performReopen = async () => {
    if (isSubmitting) return
    await withSubmitting(() => reopenReview(request.id))
  }

  const submitFeedback = async () => {
    if (isSubmitting || !feedbackDraft.trim()) return
    const submittedComment = feedbackDraft
    if (isMemberResubmission) {
      setConfirmAction({ kind: 'resubmit', comment: submittedComment })
      return
    }
    setIsSubmitting(true)
    try {
      const ok = await addFeedback(request.id, submittedComment)
      if (ok) {
        setFeedbackDraft((current) => (current === submittedComment ? '' : current))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const performResubmit = async (comment: string) => {
    if (isSubmitting) return
    const ok = await withSubmitting(() => resubmitReview(request.id, comment))
    if (!ok) return
    setFeedbackDraft((current) => (current === comment ? '' : current))
    setTransitionNotice({ text: '같은 검토요청으로 재검토를 요청했습니다.', tone: 'pending' })
    window.setTimeout(() => setTransitionNotice(null), 2600)
  }

  const confirmPendingAction = async () => {
    const action = confirmAction
    if (!action) return
    setConfirmAction(null)
    if (action.kind === 'approve') await performStatusTransition('approved')
    if (action.kind === 'reject') await performStatusTransition('rejected', action.comment)
    if (action.kind === 'reopen') await performReopen()
    if (action.kind === 'resubmit') await performResubmit(action.comment)
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

  const removeFeedback = (feedbackId: string) => {
    setVoidFeedbackId(feedbackId)
    setVoidReason('')
  }

  const confirmVoidFeedback = async () => {
    if (!voidFeedbackId || voidReason.trim().length < 2) return
    const ok = await withSubmitting(() => voidFeedback(voidFeedbackId, voidReason.trim()))
    if (!ok) return
    setVoidFeedbackId(null)
    setVoidReason('')
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
            <button className="ghost compact" disabled={isSubmitting} onClick={() => setConfirmAction({ kind: 'reopen' })} type="button">
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

      <h1 className="request-title" tabIndex={-1}>{request.title}</h1>

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
        {request.status === 'withdrawn' && (
          <div>
            <span>회수</span>
            <strong>{formatDate(request.withdrawn_at)} · {request.withdrawal_reason}</strong>
          </div>
        )}
      </div>

      <div className="status-timeline" data-status={request.status} aria-label="검토 상태 흐름">
        {timelineSteps.map((step, index) => {
          return (
            <div className={`status-step ${step.state}`} key={step.key}>
              <span>{renderTimelineStepIcon(index, request.status, step.state)}</span>
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
                    <p>{item.voided_at ? '무효화된 피드백' : item.comment}</p>
                    {item.voided_at && <small>사유: {item.void_reason}</small>}
                    {profile.role === 'leader' &&
                      (item.author_role ?? 'leader') === 'leader' &&
                      item.leader_id === profile.id &&
                      !item.voided_at && (
                      <div className="feedback-actions">
                        <button className="ghost compact" onClick={() => startFeedbackEdit(item.id, item.comment)} type="button">
                          수정
                        </button>
                        <button className="ghost compact" disabled={isSubmitting} onClick={() => removeFeedback(item.id)} type="button">
                          무효화
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
              <label htmlFor={`review-feedback-${request.id}`}>
                <strong>{isMemberResubmission ? '재검토 요청 내용' : '검토 피드백'}</strong>
                <span>작성자 {profile.name}</span>
              </label>
              {isMemberResubmission && (
                <span id={`review-feedback-help-${request.id}`}>
                  반려 피드백을 반영한 내용을 남기면 이 요청이 다시 파트장에게 전달됩니다.
                </span>
              )}
            </div>
            <textarea
              aria-describedby={isMemberResubmission ? `review-feedback-help-${request.id}` : undefined}
              id={`review-feedback-${request.id}`}
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
      <Modal
        className="review-action-modal"
        description={confirmAction?.kind === 'resubmit'
          ? '작성한 피드백과 함께 같은 요청을 다시 대기 상태로 전달합니다.'
          : confirmAction?.kind === 'reopen'
            ? '종결 이력은 유지되고 요청이 다시 대기 상태가 됩니다.'
            : '현재 화면에 표시된 검토요청에 상태 변경을 적용합니다.'}
        onClose={() => setConfirmAction(null)}
        open={Boolean(confirmAction)}
        title={confirmAction?.kind === 'reject'
          ? '검토요청을 반려할까요?'
          : confirmAction?.kind === 'reopen'
            ? '검토요청을 다시 열까요?'
            : confirmAction?.kind === 'resubmit'
              ? '재검토를 요청할까요?'
              : '검토요청을 완료 처리할까요?'}
      >
        <footer className="modal-footer">
          <button className="ghost" onClick={() => setConfirmAction(null)} type="button">취소</button>
          <button
            className={confirmAction?.kind === 'reject' ? 'danger' : 'primary'}
            disabled={isSubmitting}
            onClick={() => void confirmPendingAction()}
            type="button"
          >
            {confirmAction?.kind === 'reject'
              ? '반려하기'
              : confirmAction?.kind === 'reopen'
                ? '다시 열기'
                : confirmAction?.kind === 'resubmit'
                  ? '재검토 요청'
                  : '완료 처리'}
          </button>
        </footer>
      </Modal>
      <ReasonPromptModal
        description="원문은 감사 이력에 보존되고 화면에는 무효화 상태와 사유가 표시됩니다."
        maxLength={500}
        minLength={2}
        onClose={() => {
          setVoidFeedbackId(null)
          setVoidReason('')
        }}
        onSubmit={() => void confirmVoidFeedback()}
        open={Boolean(voidFeedbackId)}
        reason={voidReason}
        setReason={setVoidReason}
        submitLabel="무효화"
        title="피드백을 무효화할까요?"
      />
    </article>
  )
}
