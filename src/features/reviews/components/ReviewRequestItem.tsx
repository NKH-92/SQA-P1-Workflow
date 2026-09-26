import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Link2, Pencil, RotateCcw, Undo2 } from 'lucide-react'
import {
  Badge,
  DialogActions,
  Modal,
  OverflowMenu,
  ReasonPromptModal,
  type OverflowMenuItem,
} from '../../../components/ui'
import type { Profile, ReviewRequest } from '../../../types'
import { copyTextToClipboard } from '../../../lib/clipboard'
import { formatDate, formatDateTime } from '../../../lib/format'
import { quoted, quotedWithJosa, withJosa } from '../../../lib/korean'
import { buildShareUrl } from '../../../lib/navigation'
import { relativeDateLabel } from '../../../lib/dates'
import { REVIEW_REQUEST_LIMITS, rejectReasonError } from '../../../data/validation/reviews'
import { buildReviewRequestItemModel } from '../reviewRequestItemModel'
import { reviewRequestedAt } from '../reviewOrdering'

export type ReviewRequestItemHandlers = {
  onApprove: (request: ReviewRequest) => Promise<boolean>
  onReject: (request: ReviewRequest, reason: string) => Promise<boolean>
  onReopen: (request: ReviewRequest) => Promise<boolean>
  onEdit: (request: ReviewRequest) => void
  onResubmit: (request: ReviewRequest) => void
  onWithdraw: (request: ReviewRequest) => void
  addFeedback: (requestId: string, comment: string) => Promise<boolean>
  updateFeedback: (feedbackId: string, comment: string) => Promise<boolean>
  voidFeedback: (feedbackId: string, reason: string) => Promise<boolean>
}

type ReviewRequestItemProps = ReviewRequestItemHandlers & {
  request: ReviewRequest
  profile: Profile
  /** 검토 이력 창처럼 기록만 보는 곳: 피드백 작성·수정을 숨긴다. */
  readOnly?: boolean
  /** 이미 창 안에 있을 때: 확인을 새 창 대신 상세 안에서 묻는다(창 위의 창 금지). */
  inlineConfirm?: boolean
  /** 휴대폰 폭: 주요 행동을 화면 아래 고정 줄로 옮긴다. */
  compact?: boolean
  /** 좁은 화면에서 상세를 연 경우 목록으로 돌아가는 버튼 */
  onBackToList?: () => void
  /** 상세 아래에 이어 붙일 내용(처리 기록 등). 아래 고정 버튼 줄보다 위에 온다. */
  footer?: ReactNode
}

type Action = {
  key: string
  label: string
  onClick: () => void
  variant: 'primary' | 'secondary' | 'reject'
  icon?: ReactNode
  disabled?: boolean
  expanded?: boolean
}

type CopyState = 'idle' | 'copied' | 'manual'

function dueChipTone(tone: 'urgent' | 'warning' | 'normal' | 'done') {
  if (tone === 'urgent') return 'hot'
  if (tone === 'warning') return 'soon'
  return undefined
}

export function ReviewRequestItem({
  request,
  profile,
  readOnly = false,
  inlineConfirm = false,
  compact = false,
  onBackToList,
  footer,
  onApprove,
  onReject,
  onReopen,
  onEdit,
  onResubmit,
  onWithdraw,
  addFeedback,
  updateFeedback,
  voidFeedback,
}: ReviewRequestItemProps) {
  const [feedbackDraft, setFeedbackDraft] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dialog, setDialog] = useState<'approve' | 'reject' | 'reopen' | null>(null)
  const [rejectError, setRejectError] = useState<string | null>(null)
  const [rejectPrefilled, setRejectPrefilled] = useState(false)
  const [editingFeedbackId, setEditingFeedbackId] = useState<string | null>(null)
  const [editingFeedbackText, setEditingFeedbackText] = useState('')
  const [voidFeedbackId, setVoidFeedbackId] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const [shareUrl, setShareUrl] = useState('')
  const copyTimerRef = useRef<number | null>(null)
  const manualLinkRef = useRef<HTMLInputElement>(null)
  const rejectReasonRef = useRef<HTMLTextAreaElement>(null)
  const inlineReopenCloseRef = useRef<HTMLButtonElement>(null)
  const reopenTriggerRef = useRef<HTMLButtonElement>(null)
  const idBase = useId()
  const titleId = `${idBase}-title`
  const composerId = `${idBase}-feedback`
  const composerHelpId = `${idBase}-feedback-help`
  const rejectReasonId = `${idBase}-reject-reason`
  const rejectHelpId = `${idBase}-reject-help`
  const rejectErrorId = `${idBase}-reject-error`
  const inlineReopenId = `${idBase}-reopen-inline`

  const model = buildReviewRequestItemModel(request, profile)
  const requesterName = request.profiles?.name ?? '요청자'
  const requestedAt = reviewRequestedAt(request)
  const inlineReopenOpen = inlineConfirm && dialog === 'reopen'

  useEffect(() => () => {
    if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current)
  }, [])

  useEffect(() => {
    if (copyState !== 'manual') return
    manualLinkRef.current?.focus()
    manualLinkRef.current?.select()
  }, [copyState])

  useEffect(() => {
    if (inlineReopenOpen) inlineReopenCloseRef.current?.focus()
  }, [inlineReopenOpen])

  const withSubmitting = async <T,>(operation: () => Promise<T>): Promise<T> => {
    setIsSubmitting(true)
    try {
      return await operation()
    } finally {
      setIsSubmitting(false)
    }
  }

  const closeDialog = () => {
    const wasInlineReopen = inlineReopenOpen
    setDialog(null)
    setRejectError(null)
    if (wasInlineReopen) reopenTriggerRef.current?.focus()
  }

  const openReject = () => {
    setRejectError(null)
    setRejectPrefilled(Boolean(feedbackDraft.trim()))
    setDialog('reject')
  }

  // 확인 창은 처리가 끝나면 결과와 관계없이 닫는다. 실패 이유는 토스트로 알리고, 반려 사유는 피드백 칸에 남는다.
  const confirmApprove = async () => {
    if (isSubmitting) return
    await withSubmitting(() => onApprove(request))
    setDialog(null)
  }

  const confirmReject = async () => {
    if (isSubmitting) return
    const error = rejectReasonError(feedbackDraft)
    if (error) {
      setRejectError(error)
      rejectReasonRef.current?.focus()
      return
    }
    const reason = feedbackDraft.trim()
    const ok = await withSubmitting(() => onReject(request, reason))
    if (ok) setFeedbackDraft((current) => (current.trim() === reason ? '' : current))
    setDialog(null)
  }

  const confirmReopen = async () => {
    if (isSubmitting) return
    await withSubmitting(() => onReopen(request))
    setDialog(null)
  }

  const submitFeedback = async () => {
    if (isSubmitting || !feedbackDraft.trim()) return
    const submittedComment = feedbackDraft
    const ok = await withSubmitting(() => addFeedback(request.id, submittedComment))
    if (ok) setFeedbackDraft((current) => (current === submittedComment ? '' : current))
  }

  const saveFeedbackEdit = async () => {
    if (!editingFeedbackId || !editingFeedbackText.trim()) return
    const ok = await withSubmitting(() => updateFeedback(editingFeedbackId, editingFeedbackText))
    if (ok) {
      setEditingFeedbackId(null)
      setEditingFeedbackText('')
    }
  }

  const confirmVoidFeedback = async () => {
    if (!voidFeedbackId || voidReason.trim().length < 2) return
    const ok = await withSubmitting(() => voidFeedback(voidFeedbackId, voidReason.trim()))
    if (!ok) return
    setVoidFeedbackId(null)
    setVoidReason('')
  }

  const copyShareLink = async () => {
    const url = buildShareUrl('reviews', request.id)
    setShareUrl(url)
    const copied = await copyTextToClipboard(url)
    if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current)
    if (!copied) {
      setCopyState('manual')
      return
    }
    setCopyState('copied')
    copyTimerRef.current = window.setTimeout(() => setCopyState('idle'), 2000)
  }

  // 주요 행동: 한 화면에 채워진 버튼은 하나(승인하기·고쳐서 다시 요청하기)만 둔다.
  const actions: Action[] = []
  if (!readOnly && model.canDecide) {
    actions.push(
      { key: 'reject', label: '반려하기', onClick: openReject, variant: 'reject', disabled: isSubmitting },
      { key: 'approve', label: '승인하기', onClick: () => setDialog('approve'), variant: 'primary', disabled: isSubmitting },
    )
  }
  if (model.canReopen) {
    actions.push({
      key: 'reopen',
      label: '다시 열기',
      onClick: () => setDialog('reopen'),
      variant: 'secondary',
      icon: <RotateCcw aria-hidden="true" size={14} />,
      disabled: isSubmitting,
      expanded: inlineConfirm ? inlineReopenOpen : undefined,
    })
  }
  if (!readOnly && model.canEditOwn) {
    actions.push({
      key: 'edit',
      label: '수정',
      onClick: () => onEdit(request),
      variant: 'secondary',
      icon: <Pencil aria-hidden="true" size={14} />,
    })
  }
  if (!readOnly && model.canResubmitOwn) {
    actions.push({
      key: 'resubmit',
      label: '고쳐서 다시 요청하기',
      onClick: () => onResubmit(request),
      variant: 'primary',
    })
  }

  // 드물게 쓰는 행동은 ⋯ 메뉴로. 회수는 삭제가 아니므로 휴지통 대신 되돌리기 아이콘을 쓴다.
  const withdrawItems: OverflowMenuItem[] = !readOnly && model.canWithdrawOwn
    ? [{ label: '회수하기', onSelect: () => onWithdraw(request), icon: <Undo2 aria-hidden="true" size={14} /> }]
    : []
  const overflowItems: OverflowMenuItem[] = [
    { label: '링크 복사', onSelect: () => void copyShareLink(), icon: <Link2 aria-hidden="true" size={14} /> },
    ...withdrawItems,
  ]

  const renderAction = (action: Action, placement: 'topline' | 'bar') => {
    const size = placement === 'topline' ? ' compact' : ''
    const className = action.variant === 'primary'
      ? `primary${size}`
      : action.variant === 'reject'
        ? `ghost${size} review-reject-button`
        : `ghost${size}`
    return (
      <button
        aria-expanded={action.expanded}
        className={className}
        disabled={action.disabled}
        key={action.key}
        onClick={action.onClick}
        ref={action.key === 'reopen' ? reopenTriggerRef : undefined}
        type="button"
      >
        {action.icon}
        {action.label}
      </button>
    )
  }

  const showBar = compact && actions.length > 0

  return (
    <article aria-labelledby={titleId} className="request-item" data-status={request.status}>
      <div className="request-topline">
        {onBackToList && (
          <button className="ghost compact request-back" onClick={onBackToList} type="button">
            <ArrowLeft aria-hidden="true" size={14} />
            목록으로
          </button>
        )}
        <Badge status={request.status}>{model.statusLabel}</Badge>
        {model.showRejectionCount && <span className="review-history-chip">반려 {model.rejectionCount}회</span>}
        <span className="request-meta-inline">
          {requesterName} · <time dateTime={requestedAt ?? undefined} title={formatDate(requestedAt)}>
            {relativeDateLabel(requestedAt)}
          </time> {(request.review_round ?? 1) > 1 ? '재요청' : '요청'}
        </span>
        {/* 기한 칩은 한 화면에 한 번만: 목록이 옆에 보이면 목록 칩이 맡고, 휴대폰 전체 화면 상세에서만 여기서 보여 준다. */}
        {model.dueChip && onBackToList && (
          <span className="due-chip" data-tone={dueChipTone(model.dueChip.tone)}>
            {model.dueChip.shortLabel}
          </span>
        )}
        <div className="request-actions">
          {!compact && actions.map((action) => renderAction(action, 'topline'))}
          <span className="copy-link-wrap">
            <OverflowMenu label={`${quoted(request.title)} 더보기`} items={overflowItems} />
            {copyState === 'copied' && (
              <span className="review-copy-status" role="status">링크를 복사했어요</span>
            )}
            {copyState === 'manual' && (
              <span className="copy-link-manual" role="status">
                <small>자동 복사가 막혀 있어요. 아래 링크를 직접 복사해 주세요.</small>
                <input
                  ref={manualLinkRef}
                  aria-label="공유 링크"
                  onBlur={() => setCopyState('idle')}
                  readOnly
                  value={shareUrl}
                />
              </span>
            )}
          </span>
        </div>
      </div>

      {inlineReopenOpen && (
        <div aria-labelledby={inlineReopenId} className="review-inline-confirm" role="group">
          <p id={inlineReopenId}>
            <strong>{quotedWithJosa(request.title, '을/를')} 다시 열까요?</strong>
            지금까지의 처리 기록은 남고, 요청은 다시 대기 중이 돼요.
          </p>
          <div>
            <button className="ghost compact" onClick={closeDialog} ref={inlineReopenCloseRef} type="button">
              닫기
            </button>
            <button className="primary compact" disabled={isSubmitting} onClick={() => void confirmReopen()} type="button">
              다시 열기
            </button>
          </div>
        </div>
      )}

      <h2 className="request-title" data-detail-title id={titleId} tabIndex={-1}>{request.title}</h2>

      {/* 요청 한 번뿐이면 위의 요청 시각·요청일과 같은 내용이라 보여주지 않는다. */}
      {model.progressSteps.length > 1 && (
        <ol aria-label="진행 기록" className="request-progress">
          {model.progressSteps.map((step) => (
            <li data-step={step.key} key={step.key}>
              {step.at ? (
                <time dateTime={step.at} title={formatDateTime(step.at)}>{step.label}</time>
              ) : step.label}
            </li>
          ))}
        </ol>
      )}

      <div className="request-meta-grid">
        <div>
          <span>요청자</span>
          <strong>{requesterName}</strong>
        </div>
        <div>
          <span>{(request.review_round ?? 1) > 1 ? '마지막 재요청' : '요청일'}</span>
          <strong>{formatDate(requestedAt)}</strong>
        </div>
        <div>
          <span>검토 기한</span>
          <strong>{request.due_date ? formatDate(request.due_date) : '기한 없음'}</strong>
        </div>
        {request.status === 'withdrawn' && (
          <div>
            <span>회수 사유</span>
            <strong>{request.withdrawal_reason || '-'}</strong>
          </div>
        )}
      </div>

      <p className="request-description">{request.description}</p>

      <div className="feedback-block">
        <header>
          <h3>피드백</h3>
          <span>{model.requestFeedback.length}개</span>
        </header>
        {model.requestFeedback.length === 0 && <div className="feedback-empty">아직 피드백이 없어요.</div>}
        {model.requestFeedback.length > 0 && (
          <div className="feedback-list">
            {model.requestFeedback.map((item) => {
              const authorRole = (item.author_role ?? 'leader') === 'leader' ? '파트장' : '파트원'
              const canManage = !readOnly
                && profile.role === 'leader'
                && (item.author_role ?? 'leader') === 'leader'
                && item.leader_id === profile.id
                && !item.voided_at
              return (
                <div className="feedback" data-author={item.author_role ?? 'leader'} key={item.id}>
                  <span>
                    {item.profiles?.name ?? authorRole}
                    {' · '}{authorRole}
                    {' · '}{formatDate(item.created_at)}
                  </span>
                  {editingFeedbackId === item.id ? (
                    <div className="feedback-edit-form">
                      <textarea
                        aria-label="피드백 수정"
                        maxLength={REVIEW_REQUEST_LIMITS.commentMax}
                        value={editingFeedbackText}
                        onChange={(event) => setEditingFeedbackText(event.target.value)}
                      />
                      <div className="feedback-edit-actions">
                        <button className="ghost compact" onClick={() => setEditingFeedbackId(null)} type="button">
                          닫기
                        </button>
                        <button
                          className="primary compact"
                          disabled={isSubmitting || !editingFeedbackText.trim()}
                          onClick={() => void saveFeedbackEdit()}
                          type="button"
                        >
                          저장하기
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p>{item.voided_at ? '무효화한 피드백' : item.comment}</p>
                      {item.voided_at && <small>사유: {item.void_reason}</small>}
                      {canManage && (
                        <div className="feedback-actions">
                          <button
                            className="ghost compact"
                            onClick={() => {
                              setEditingFeedbackId(item.id)
                              setEditingFeedbackText(item.comment)
                            }}
                            type="button"
                          >
                            수정
                          </button>
                          <button
                            className="ghost compact"
                            disabled={isSubmitting}
                            onClick={() => {
                              setVoidFeedbackId(item.id)
                              setVoidReason('')
                            }}
                            type="button"
                          >
                            무효화
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {!readOnly && model.canLeaveFeedback && (
          <div className="feedback-composer">
            <div className="feedback-composer-head">
              <label htmlFor={composerId}>
                <strong>검토 피드백</strong>
              </label>
              <span id={composerHelpId}>
                {model.canDecide
                  ? '반려하면 이 내용이 반려 사유로 함께 가요.'
                  : '남긴 피드백은 요청자에게 바로 보여요.'}
              </span>
            </div>
            <textarea
              aria-describedby={composerHelpId}
              disabled={isSubmitting}
              id={composerId}
              maxLength={REVIEW_REQUEST_LIMITS.commentMax}
              onChange={(event) => setFeedbackDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  void submitFeedback()
                }
              }}
              placeholder="요청자에게 전할 피드백을 적어 주세요"
              value={feedbackDraft}
            />
            <div className="feedback-composer-foot">
              <span className="modal-shortcut">
                <kbd>Ctrl</kbd>
                <kbd>Enter</kbd>
                남기기
              </span>
              <button
                className="ghost compact"
                disabled={isSubmitting || !feedbackDraft.trim()}
                onClick={() => void submitFeedback()}
                type="button"
              >
                피드백 남기기
              </button>
            </div>
          </div>
        )}
      </div>

      {footer}

      {showBar && (
        <div className="mobile-action-bar review-mobile-actions">
          {actions.map((action) => renderAction(action, 'bar'))}
        </div>
      )}

      <Modal
        className="review-action-modal"
        closeLabel="승인 확인 창 닫기"
        description="승인하면 요청자에게 결과가 전달돼요. 필요하면 나중에 다시 열 수 있어요."
        onClose={closeDialog}
        open={dialog === 'approve'}
        title={`${quotedWithJosa(request.title, '을/를')} 승인할까요?`}
      >
        <DialogActions onClose={closeDialog}>
          <button aria-busy={isSubmitting || undefined} className="primary" disabled={isSubmitting} onClick={() => void confirmApprove()} type="button">
            {isSubmitting ? '승인하는 중…' : '승인하기'}
          </button>
        </DialogActions>
      </Modal>

      <Modal
        className="review-action-modal"
        closeLabel="반려 확인 창 닫기"
        description={`반려 사유는 ${requesterName}에게 바로 전달돼요. ${withJosa(requesterName, '은/는')} 내용을 고쳐 다시 요청할 수 있어요.`}
        initialFocusRef={rejectReasonRef}
        onClose={closeDialog}
        open={dialog === 'reject'}
        title={`${quotedWithJosa(request.title, '을/를')} 반려할까요?`}
      >
        <form
          className="review-reject-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void confirmReject()
          }}
        >
          <div className="review-dialog-body">
            <label className="review-dialog-label" htmlFor={rejectReasonId}>
              반려 사유
              <span aria-hidden="true">*</span>
            </label>
            <textarea
              aria-describedby={rejectError ? `${rejectErrorId} ${rejectHelpId}` : rejectHelpId}
              aria-invalid={rejectError ? true : undefined}
              aria-required="true"
              id={rejectReasonId}
              maxLength={REVIEW_REQUEST_LIMITS.commentMax}
              onChange={(event) => {
                setFeedbackDraft(event.target.value)
                if (rejectError) setRejectError(rejectReasonError(event.target.value))
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  void confirmReject()
                }
              }}
              placeholder="예: 영향 범위 표가 빠져 있어요. 표를 추가해서 다시 요청해 주세요."
              ref={rejectReasonRef}
              value={feedbackDraft}
            />
            {rejectError && <p className="field-error" id={rejectErrorId}>{rejectError}</p>}
            <small className="review-dialog-help" id={rejectHelpId}>
              {rejectPrefilled
                ? '작성 중이던 피드백을 옮겨 왔어요. 고쳐 쓸 수 있어요.'
                : '무엇을 고치면 되는지 적어 주세요.'}
            </small>
          </div>
          <DialogActions onClose={closeDialog}>
            <button aria-busy={isSubmitting || undefined} className="danger" disabled={isSubmitting} type="submit">
              {isSubmitting ? '반려하는 중…' : '반려하기'}
            </button>
          </DialogActions>
        </form>
      </Modal>

      {!inlineConfirm && (
        <Modal
          className="review-action-modal"
          closeLabel="다시 열기 확인 창 닫기"
          description="지금까지의 처리 기록은 남고, 요청은 다시 대기 중이 돼요."
          onClose={closeDialog}
          open={dialog === 'reopen'}
          title={`${quotedWithJosa(request.title, '을/를')} 다시 열까요?`}
        >
          <DialogActions onClose={closeDialog}>
            <button aria-busy={isSubmitting || undefined} className="primary" disabled={isSubmitting} onClick={() => void confirmReopen()} type="button">
              {isSubmitting ? '다시 여는 중…' : '다시 열기'}
            </button>
          </DialogActions>
        </Modal>
      )}

      <ReasonPromptModal
        description="원문은 감사 이력에 남고, 화면에는 무효화했다는 표시와 사유만 보여요."
        label="무효화 사유"
        maxLength={500}
        minLength={2}
        onClose={() => {
          setVoidFeedbackId(null)
          setVoidReason('')
        }}
        onSubmit={() => void confirmVoidFeedback()}
        open={Boolean(voidFeedbackId)}
        placeholder="예: 다른 요청에 남길 피드백이었어요"
        reason={voidReason}
        setReason={setVoidReason}
        submitLabel="무효화하기"
        submitting={isSubmitting}
        title="피드백을 무효화할까요?"
      />
    </article>
  )
}
