import { useId } from 'react'
import { Pencil } from 'lucide-react'
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
  submitLabel = '저장',
  maxLength = 500,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  reason: string
  setReason: (value: string) => void
  onSubmit: () => void
  submitLabel?: string
  maxLength?: number
}) {
  const fieldId = useId()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      eyebrow="변경 사유"
      icon={<Pencil size={18} />}
      closeLabel="변경 사유 입력 닫기"
    >
      <FormGrid
        fields={
          <label className="wide" htmlFor={fieldId}>
            변경 사유
            <textarea
              id={fieldId}
              maxLength={maxLength}
              placeholder="예: 담당자 협의에 따라 정보를 수정합니다."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <small>{reason.length}/{maxLength}자</small>
          </label>
        }
        onSubmit={onSubmit}
        disabled={!reason.trim()}
        submitLabel={submitLabel}
      />
    </Modal>
  )
}
