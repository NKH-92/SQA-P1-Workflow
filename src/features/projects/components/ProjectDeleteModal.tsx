import { useId, useRef, useState, type FormEvent, type RefObject } from 'react'
import { Trash2 } from 'lucide-react'
import { DialogActions, Modal } from '../../../components/ui'
import { quotedWithJosa } from '../../../lib/korean'
import type { Project } from '../../../types'

const REASON_MAX_LENGTH = 500

/**
 * 프로젝트 삭제 확인 창. 감사 기록에 남길 사유를 받는다(필수).
 * 버튼은 늘 누를 수 있게 두고, 사유가 비어 있으면 칸 아래에 이유를 알려준다.
 */
export function ProjectDeleteModal({
  project,
  onClose,
  onDelete,
  returnFocusRef,
}: {
  project: Project
  onClose: () => void
  onDelete: (reason: string) => Promise<boolean>
  returnFocusRef?: RefObject<HTMLElement>
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fieldId = useId()
  const errorId = useId()
  const countId = useId()
  const fieldRef = useRef<HTMLTextAreaElement>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (deleting) return
    if (!reason.trim()) {
      setError('삭제 사유를 입력해 주세요')
      fieldRef.current?.focus()
      return
    }
    setDeleting(true)
    try {
      await onDelete(reason.trim())
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal
      className="project-dialog"
      closeLabel="프로젝트 삭제 닫기"
      description="담당자 배정도 함께 지워지고, 삭제한 프로젝트는 되돌릴 수 없어요."
      dirty={reason.trim().length > 0}
      eyebrow="프로젝트 삭제"
      icon={<Trash2 size={18} />}
      onClose={onClose}
      open
      returnFocusRef={returnFocusRef}
      title={`${quotedWithJosa(project.name, '을/를')} 삭제할까요?`}
    >
      <form aria-busy={deleting || undefined} className="project-dialog-form" noValidate onSubmit={(event) => void submit(event)}>
        <div className="project-dialog-body">
          <div className="modal-field-stack">
            <label htmlFor={fieldId}>
              삭제 사유 <span aria-hidden="true">*</span>
            </label>
            <textarea
              ref={fieldRef}
              aria-describedby={error ? `${errorId} ${countId}` : countId}
              aria-invalid={error ? true : undefined}
              aria-required="true"
              id={fieldId}
              maxLength={REASON_MAX_LENGTH}
              onChange={(event) => {
                setReason(event.target.value)
                if (error && event.target.value.trim()) setError(null)
              }}
              placeholder="예: 같은 프로젝트를 두 번 만들어서 정리해요."
              value={reason}
            />
            {error && (
              <p className="field-error" id={errorId}>
                {error}
              </p>
            )}
            <p className="field-count" id={countId}>
              {reason.length}/{REASON_MAX_LENGTH}자
            </p>
          </div>
        </div>
        <DialogActions onClose={onClose}>
          <button className="danger" disabled={deleting} type="submit">
            {deleting ? '삭제하는 중…' : '삭제하기'}
          </button>
        </DialogActions>
      </form>
    </Modal>
  )
}
