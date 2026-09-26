import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Pencil, RotateCcw, Send } from 'lucide-react'
import { Badge, DialogActions, Modal } from '../../../components/ui'
import { formatClock, formatMonthDay } from '../../../lib/format'
import { businessDateKey, businessDateParts } from '../../../lib/businessTime'
import { REVIEW_REQUEST_LIMITS } from '../../../data/validation/reviews'
import type { ReviewFormState } from '../useReviewDraft'
import {
  firstInvalidReviewField,
  validateReviewComposer,
  type ReviewComposerField,
} from '../reviewComposerValidation'

const deadlineQuickOptions = [
  { label: '오늘', days: 0 },
  { label: '내일', days: 1 },
  { label: '3일 후', days: 3 },
  { label: '7일 후', days: 7 },
]

// Compute the date at click/render time (not at mount) so a composer left open past
// midnight does not stamp yesterday's date onto "오늘".
function quickDeadlineDate(days: number) {
  const { year, month, day } = businessDateParts(new Date())
  return businessDateKey(new Date(Date.UTC(year, month - 1, day + days, 12)))
}

export type ReviewComposerMode = 'new' | 'edit' | 'resubmit'

const COPY: Record<ReviewComposerMode, {
  eyebrow: string
  title: string
  description?: string
  submit: string
  submitting: string
  closeLabel: string
}> = {
  new: {
    eyebrow: '새 검토요청',
    title: '어떤 검토가 필요한가요?',
    submit: '검토요청 보내기',
    submitting: '보내는 중…',
    closeLabel: '검토요청 작성 닫기',
  },
  edit: {
    eyebrow: '검토요청 수정',
    title: '요청 내용을 고쳐 주세요',
    submit: '저장하기',
    submitting: '저장하는 중…',
    closeLabel: '검토요청 수정 닫기',
  },
  resubmit: {
    eyebrow: '재요청',
    title: '반려 사유를 반영해 고쳐 주세요',
    description: '다시 요청하면 파트장에게 바로 전달돼요.',
    submit: '다시 요청하기',
    submitting: '보내는 중…',
    closeLabel: '재요청 작성 닫기',
  },
}

const FIELD_IDS: Record<ReviewComposerField, string> = {
  title: 'review-title-v2',
  description: 'review-description-v2',
  due_date: 'review-deadline-v2',
  note: 'review-resubmit-note',
}

const errorId = (field: ReviewComposerField) => `${FIELD_IDS[field]}-error`

type ReviewComposerModalProps = {
  open: boolean
  mode: ReviewComposerMode
  form: ReviewFormState
  setForm: Dispatch<SetStateAction<ReviewFormState>>
  /** 재요청 내용(재요청 모드에서만 쓴다) */
  note?: string
  setNote?: (value: string) => void
  /** 재요청 모드: 참고로 보여줄 마지막 반려 사유 */
  rejectionReason?: string | null
  /** 수정·재요청 모드: 원래 기한. 지난 날짜라도 그대로 두면 저장할 수 있다. */
  originalDueDate?: string | null
  draftNotice: string | null
  draftSavedAt: Date | null
  /** 새 요청 모드: 자동 임시저장을 기다리는 변경이 있는지 */
  autosavePending?: boolean
  reviewTargetName: string | null
  /** 자동 저장이 없는 수정·재요청에서 입력을 바꿨는지(닫기 전에 확인한다) */
  dirty?: boolean
  submitting?: boolean
  onClose: () => void
  onSubmit: () => void
}

/**
 * 검토요청 작성·수정·재요청 창. 상태·뮤테이션은 ReviewsPanel이 소유하고 여기는 표현과 입력 검사만 맡는다.
 * 보내기 버튼은 늘 누를 수 있고, 누르면 빠진 칸 아래에 이유를 보여주고 그 칸으로 포커스를 옮긴다.
 */
export function ReviewComposerModal({
  open,
  mode,
  form,
  setForm,
  note = '',
  setNote,
  rejectionReason = null,
  originalDueDate = null,
  draftNotice,
  draftSavedAt,
  autosavePending = false,
  reviewTargetName,
  dirty = false,
  submitting = false,
  onClose,
  onSubmit,
}: ReviewComposerModalProps) {
  const [showErrors, setShowErrors] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const dueDateRef = useRef<HTMLInputElement>(null)
  const deadlineModeRef = useRef<HTMLButtonElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) setShowErrors(false)
  }, [open])

  const copy = COPY[mode]
  const today = quickDeadlineDate(0)
  const editingExisting = mode !== 'new'
  const dueDateMin = editingExisting && form.due_date && form.due_date < today ? undefined : today
  const validationOptions = {
    today,
    existingDueDate: editingExisting ? originalDueDate : null,
    note: mode === 'resubmit' ? note : undefined,
  }
  const errors = showErrors ? validateReviewComposer(form, validationOptions) : {}

  const focusField = (field: ReviewComposerField) => {
    const target = field === 'title'
      ? titleRef.current
      : field === 'description'
        ? descriptionRef.current
        : field === 'note'
          ? noteRef.current
          : dueDateRef.current ?? deadlineModeRef.current
    target?.focus()
  }

  const submit = () => {
    if (submitting) return
    const nextErrors = validateReviewComposer(form, validationOptions)
    const firstInvalid = firstInvalidReviewField(nextErrors)
    if (firstInvalid) {
      setShowErrors(true)
      // 오류 문구가 그려진 뒤 포커스해야 aria-describedby로 이유가 함께 읽힌다.
      window.setTimeout(() => focusField(firstInvalid), 0)
      return
    }
    onSubmit()
  }

  const applyQuickDeadline = (days: number) =>
    setForm((current) => ({ ...current, deadlineMode: 'date', due_date: quickDeadlineDate(days) }))

  const describedBy = (field: ReviewComposerField, ...ids: string[]) =>
    [errors[field] ? errorId(field) : null, ...ids].filter(Boolean).join(' ') || undefined

  const fieldError = (field: ReviewComposerField) =>
    errors[field] ? <p className="field-error" id={errorId(field)}>{errors[field]}</p> : null

  const autosaveHint = mode !== 'new'
    ? null
    : draftSavedAt && !autosavePending
      ? `임시저장됨 · ${formatClock(draftSavedAt) ?? ''}`
      : '입력한 내용은 자동으로 임시저장돼요'

  return (
    <Modal
      className="review-modal"
      closeLabel={copy.closeLabel}
      description={copy.description}
      dirty={dirty}
      eyebrow={copy.eyebrow}
      icon={mode === 'new' ? <Send size={18} /> : mode === 'edit' ? <Pencil size={18} /> : <RotateCcw size={18} />}
      initialFocusRef={titleRef}
      onClose={onClose}
      open={open}
      title={copy.title}
    >
      <form
        aria-busy={submitting || undefined}
        className="review-compose-form"
        noValidate
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            submit()
          }
        }}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <div className="review-compose-body">
          {draftNotice && <p className="draft-notice" role="status">{draftNotice}</p>}
          {mode === 'resubmit' && rejectionReason && (
            <div className="review-compose-rejection">
              <span>반려 사유</span>
              <p>{rejectionReason}</p>
            </div>
          )}
          <div className="modal-field-row">
            <label htmlFor={FIELD_IDS.title}>
              제목
              <span aria-hidden="true">*</span>
            </label>
            <div>
              <input
                aria-describedby={describedBy('title', 'review-title-count-v2')}
                aria-invalid={errors.title ? true : undefined}
                aria-required="true"
                id={FIELD_IDS.title}
                maxLength={REVIEW_REQUEST_LIMITS.titleMax}
                placeholder="예: 파트너 API 전환 검토"
                ref={titleRef}
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              />
              {fieldError('title')}
              <small id="review-title-count-v2">
                {form.title.trim().length}/{REVIEW_REQUEST_LIMITS.titleMax}자
              </small>
            </div>
          </div>
          <div className="modal-field-row">
            <label htmlFor={FIELD_IDS.description}>
              설명
              <span aria-hidden="true">*</span>
            </label>
            <div>
              <textarea
                aria-describedby={describedBy('description', 'review-description-help-v2', 'review-description-count-v2')}
                aria-invalid={errors.description ? true : undefined}
                aria-required="true"
                id={FIELD_IDS.description}
                maxLength={REVIEW_REQUEST_LIMITS.descriptionMax}
                placeholder="검토 사유, 배경, 확인할 점을 적어 주세요"
                ref={descriptionRef}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
              {fieldError('description')}
              <p id="review-description-help-v2">배경과 확인할 점을 나눠 적으면 파트장이 빨리 읽을 수 있어요.</p>
              <small id="review-description-count-v2">
                {form.description.trim().length.toLocaleString('ko-KR')}/{REVIEW_REQUEST_LIMITS.descriptionMax.toLocaleString('ko-KR')}자
              </small>
            </div>
          </div>
          <div className="modal-field-row">
            <span className="modal-label">검토 자료</span>
            <div>
              <p className="draft-notice">
                검토 자료는 메신저로 따로 보내고, 설명에 자료 이름과 확인할 점을 적어 주세요.
              </p>
            </div>
          </div>
          <div className="modal-field-row">
            <span className="modal-label" id="review-deadline-label">검토 기한</span>
            <div aria-labelledby="review-deadline-label" role="group">
              <div className="deadline-toggle" role="group" aria-label="검토 기한 방식">
                <button
                  aria-pressed={form.deadlineMode === 'none'}
                  className={form.deadlineMode === 'none' ? 'selected' : ''}
                  onClick={() => setForm((current) => ({ ...current, deadlineMode: 'none', due_date: '' }))}
                  type="button"
                >
                  기한 없음
                </button>
                <button
                  aria-pressed={form.deadlineMode === 'date'}
                  className={form.deadlineMode === 'date' ? 'selected' : ''}
                  onClick={() => setForm((current) => ({ ...current, deadlineMode: 'date' }))}
                  ref={deadlineModeRef}
                  type="button"
                >
                  날짜 선택
                </button>
              </div>
              <div className="deadline-chip-row">
                {deadlineQuickOptions.map((option) => {
                  const optionValue = quickDeadlineDate(option.days)
                  return (
                    <button
                      aria-pressed={form.deadlineMode === 'date' && form.due_date === optionValue}
                      className={form.deadlineMode === 'date' && form.due_date === optionValue ? 'selected' : ''}
                      key={option.label}
                      onClick={() => applyQuickDeadline(option.days)}
                      type="button"
                    >
                      <span>{option.label}</span>
                      <small>{formatMonthDay(optionValue)}</small>
                    </button>
                  )
                })}
              </div>
              {form.deadlineMode === 'date' && (
                <input
                  aria-describedby={describedBy('due_date')}
                  aria-invalid={errors.due_date ? true : undefined}
                  aria-label="검토 기한 날짜"
                  id={FIELD_IDS.due_date}
                  min={dueDateMin}
                  ref={dueDateRef}
                  type="date"
                  value={form.due_date}
                  onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))}
                />
              )}
              {fieldError('due_date')}
            </div>
          </div>
          {mode === 'resubmit' && (
            <div className="modal-field-row">
              <label htmlFor={FIELD_IDS.note}>
                재요청 내용
                <span aria-hidden="true">*</span>
              </label>
              <div>
                <textarea
                  aria-describedby={describedBy('note', 'review-resubmit-note-help')}
                  aria-invalid={errors.note ? true : undefined}
                  aria-required="true"
                  id={FIELD_IDS.note}
                  maxLength={REVIEW_REQUEST_LIMITS.commentMax}
                  placeholder="고친 내용과 확인받을 점을 파트장에게 알려 주세요"
                  ref={noteRef}
                  value={note}
                  onChange={(event) => setNote?.(event.target.value)}
                />
                {fieldError('note')}
                <p id="review-resubmit-note-help">이 내용은 피드백으로 남고, 파트장이 먼저 읽어요.</p>
              </div>
            </div>
          )}
          <div className="modal-field-row">
            <span className="modal-label">요청 대상</span>
            <div className="review-target">
              <div>
                <strong>{reviewTargetName ?? '파트장 자동 지정'}</strong>
                <p>보내면 바로 파트장의 우선 처리 목록에 올라가요.</p>
              </div>
              <Badge status="pending">기본</Badge>
            </div>
          </div>
        </div>
        <DialogActions
          hint={(
            <>
              {autosaveHint && <span className="review-autosave">{autosaveHint}</span>}
              <span className="modal-shortcut">
                <kbd>Ctrl</kbd>
                <kbd>Enter</kbd>
                {mode === 'edit' ? '저장하기' : '보내기'}
              </span>
            </>
          )}
          onClose={onClose}
        >
          <button className="primary" disabled={submitting} type="submit">
            {mode === 'new' && <Send size={16} aria-hidden="true" />}
            {submitting ? copy.submitting : copy.submit}
          </button>
        </DialogActions>
      </form>
    </Modal>
  )
}
