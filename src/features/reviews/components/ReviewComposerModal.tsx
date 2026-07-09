import type { Dispatch, SetStateAction } from 'react'
import { Paperclip, Send, X } from 'lucide-react'
import { Badge } from '../../../components/ui'
import { useModalDismiss } from '../../../hooks/useModalDismiss'
import { formatDate } from '../../../lib/format'
import type { ReviewFormState } from '../useReviewDraft'

const deadlineQuickOptions = [
  { label: '오늘', days: 0 },
  { label: '내일', days: 1 },
  { label: '이번 주', days: 3 },
  { label: '다음 주', days: 7 },
]

// Compute the date at click/render time (not at mount) so a composer left open past
// midnight does not stamp yesterday's date onto "오늘".
function quickDeadlineDate(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function preventModalFileDrop(event: React.DragEvent) {
  event.preventDefault()
  event.stopPropagation()
}

type ReviewComposerModalProps = {
  open: boolean
  /** null이면 새 요청 작성, 값이 있으면 해당 요청 수정 */
  editingReviewId: string | null
  form: ReviewFormState
  setForm: Dispatch<SetStateAction<ReviewFormState>>
  draftNotice: string | null
  draftSavedAt: Date | null
  attachmentFile: File | null
  setAttachmentFile: (file: File | null) => void
  existingStorageAttachment: string | null
  reviewTargetName: string | null
  isSubmitDisabled: boolean
  onSaveDraft: () => void
  onClose: () => void
  onSubmit: () => void
}

/** 검토요청 작성/수정 모달. 상태·뮤테이션은 ReviewsPanel이 소유하고 여기는 표현만 담당한다. */
export function ReviewComposerModal({
  open,
  editingReviewId,
  form,
  setForm,
  draftNotice,
  draftSavedAt,
  attachmentFile,
  setAttachmentFile,
  existingStorageAttachment,
  reviewTargetName,
  isSubmitDisabled,
  onSaveDraft,
  onClose,
  onSubmit,
}: ReviewComposerModalProps) {
  useModalDismiss(open, onClose)

  if (!open) return null

  const applyQuickDeadline = (days: number) =>
    setForm((current) => ({ ...current, deadlineMode: 'date', due_date: quickDeadlineDate(days) }))

  return (
    <div className="modal-backdrop" onMouseDown={() => onClose()} role="presentation">
      <section
        aria-labelledby="review-composer-title-v2"
        aria-modal="true"
        className="modal-card review-modal modal-a"
        onDragOver={preventModalFileDrop}
        onDrop={preventModalFileDrop}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal-header modal-header-v2">
          <div className="modal-mark" aria-hidden="true">
            <Send size={18} />
          </div>
          <div>
            <span>{editingReviewId ? '검토요청 수정' : '새 검토요청'}</span>
            <h2 id="review-composer-title-v2">
              {editingReviewId ? '요청 내용을 수정하세요' : '무엇을 검토받고 싶으세요?'}
            </h2>
          </div>
          {!editingReviewId && (
            <span className="autosave-chip" data-saved={draftSavedAt ? 'true' : 'false'}>
              {draftSavedAt
                ? `${draftSavedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 저장됨`
                : '초안 · 저장되지 않음'}
            </span>
          )}
          <button
            aria-label="검토요청 작성 닫기"
            className="icon-button modal-close"
            onClick={() => onClose()}
            type="button"
          >
            <X size={18} />
          </button>
        </header>
        <form
          className="review-compose-form review-compose-form-v2"
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              if (!isSubmitDisabled) onSubmit()
            }
          }}
          onSubmit={(event) => {
            event.preventDefault()
            if (isSubmitDisabled) return
            onSubmit()
          }}
        >
          <div className="review-compose-body">
            <div className="modal-field-row">
              <label htmlFor="review-title-v2">
                제목
                <span>*</span>
              </label>
              <div>
                <input
                  autoFocus
                  id="review-title-v2"
                  placeholder="예: 파트너 API 전환 검토"
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
              </div>
            </div>
            <div className="modal-field-row">
              <label htmlFor="review-description-v2">
                설명
                <span>*</span>
              </label>
              <div>
                <textarea
                  id="review-description-v2"
                  placeholder="검토 사유, 배경, 확인해야 할 포인트를 적어주세요."
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
                <p>무엇을 검토받고 싶은지 파트장이 빠르게 읽을 수 있게 배경과 요청 포인트를 분리해 주세요.</p>
              </div>
            </div>
            <div className="modal-field-row">
              <label htmlFor="review-attachment-v2">첨부</label>
              <div>
                <label className="attachment-dropzone">
                  <input
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt,.zip"
                    hidden
                    onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
                    type="file"
                  />
                  <span className="attachment-icon" aria-hidden="true">
                    <Paperclip size={16} />
                  </span>
                  <span className="attachment-copy">
                    <strong>{attachmentFile ? attachmentFile.name : '파일을 선택하세요'}</strong>
                    <small>{attachmentFile ? '선택됨 · 다시 클릭하면 변경' : 'PDF, 문서, 이미지 · 10MB 이하'}</small>
                  </span>
                  <span className="ghost compact attachment-pick">파일 선택</span>
                </label>
                {existingStorageAttachment && !attachmentFile && (
                  <p className="draft-notice">기존 첨부 파일이 유지됩니다.</p>
                )}
              </div>
            </div>
            <div className="modal-field-row">
              <label htmlFor="review-deadline-v2">마감</label>
              <div>
                <div className="deadline-toggle">
                  <button
                    className={form.deadlineMode === 'none' ? 'selected' : ''}
                    onClick={() => setForm({ ...form, deadlineMode: 'none', due_date: '' })}
                    type="button"
                  >
                    기한없음
                  </button>
                  <button
                    className={form.deadlineMode === 'date' ? 'selected' : ''}
                    onClick={() => setForm({ ...form, deadlineMode: 'date' })}
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
                        className={form.deadlineMode === 'date' && form.due_date === optionValue ? 'selected' : ''}
                        key={option.label}
                        onClick={() => applyQuickDeadline(option.days)}
                        type="button"
                      >
                        <span>{option.label}</span>
                        <small>{formatDate(optionValue).slice(6)}</small>
                      </button>
                    )
                  })}
                </div>
                {form.deadlineMode === 'date' && (
                  <input
                    aria-label="검토 기한 날짜"
                    id="review-deadline-v2"
                    type="date"
                    value={form.due_date}
                    onChange={(event) => setForm({ ...form, due_date: event.target.value })}
                  />
                )}
              </div>
            </div>
            <div className="modal-field-row">
              <span className="modal-label">요청 대상</span>
              <div className="review-target">
                <div>
                  <strong>{reviewTargetName ?? '파트장 자동 지정'}</strong>
                  <p>등록 즉시 파트장 우선처리 목록에 반영됩니다.</p>
                </div>
                <Badge status="pending">기본</Badge>
              </div>
            </div>
          </div>
          <footer className="modal-footer">
            {draftNotice && <p className="draft-notice">{draftNotice}</p>}
            <span className="modal-shortcut">
              <kbd>Ctrl</kbd>
              <kbd>Enter</kbd>
              보내기
              <span>·</span>
              <kbd>Esc</kbd>
              닫기
            </span>
            <div>
              {!editingReviewId && (
                <button className="ghost" onClick={() => onSaveDraft()} type="button">
                  초안 저장
                </button>
              )}
              <button className="ghost" onClick={() => onClose()} type="button">
                닫기
              </button>
              <button className="primary" disabled={isSubmitDisabled} type="submit">
                <Send size={16} />
                {editingReviewId ? '수정 저장' : '검토요청 보내기'}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  )
}
