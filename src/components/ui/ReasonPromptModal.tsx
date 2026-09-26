import { useId } from 'react'
import { Pencil } from 'lucide-react'
import { withJosa } from '../../lib/korean'
import { FormGrid } from './FormGrid'
import { Modal } from './Modal'

/**
 * Shared reason-capture step for every important-master OCC
 * mutation (product/duty/duty-major-category/invite update, profile active
 * toggle). Keeping this as one component means every reason-required
 * operation validates the same non-blank/length rule and renders the same
 * modal shape, instead of each panel re-implementing its own prompt.
 */
export function ReasonPromptModal({
  open,
  onClose,
  title,
  description,
  reason,
  setReason,
  onSubmit,
  submitLabel = '저장하기',
  minLength = 1,
  maxLength = 500,
  label = '변경 사유',
  placeholder = '예: 담당자와 협의해서 정보를 고쳐요.',
  submitting = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  reason: string
  setReason: (value: string) => void
  onSubmit: () => void
  submitLabel?: string
  minLength?: number
  maxLength?: number
  /** 사유 칸 이름. 예: ‘회수 사유’, ‘해제 사유’ */
  label?: string
  placeholder?: string
  submitting?: boolean
}) {
  const fieldId = useId()
  const tooShort = reason.trim().length < minLength

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      eyebrow="사유 입력"
      icon={<Pencil size={18} />}
      closeLabel="사유 입력 닫기"
      dirty={reason.trim().length > 0}
    >
      <FormGrid
        fields={
          <label className="wide" htmlFor={fieldId}>
            {label}
            <textarea
              id={fieldId}
              minLength={minLength}
              maxLength={maxLength}
              placeholder={placeholder}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <small>{reason.length}/{maxLength}자</small>
          </label>
        }
        onSubmit={onSubmit}
        onCancel={onClose}
        disabled={tooShort}
        disabledReason={`${withJosa(label, '을/를')} 입력해 주세요.`}
        submitLabel={submitLabel}
        submitting={submitting}
      />
    </Modal>
  )
}
