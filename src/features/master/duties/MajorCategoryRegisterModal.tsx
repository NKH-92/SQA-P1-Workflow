import type { Dispatch, SetStateAction } from 'react'
import { ClipboardList, Plus } from 'lucide-react'
import { FormGrid, Modal } from '../../../components/ui'

export function MajorCategoryRegisterModal({
  open,
  onClose,
  majorCategoryForm,
  setMajorCategoryForm,
  onSubmit,
  submitting = false,
}: {
  open: boolean
  onClose: () => void
  majorCategoryForm: { name: string }
  setMajorCategoryForm: Dispatch<SetStateAction<{ name: string }>>
  onSubmit: () => void
  submitting?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="대분류 등록"
      titleId="major-category-register-title"
      eyebrow="업무 카테고리"
      icon={<ClipboardList size={18} />}
      closeLabel="대분류 등록 닫기"
      dirty={Boolean(majorCategoryForm.name.trim()) && !submitting}
    >
      <FormGrid
        fields={
          <label>
            대분류명
            <input
              aria-required="true"
              placeholder="예: 품질 관리"
              value={majorCategoryForm.name}
              onChange={(event) => setMajorCategoryForm({ name: event.target.value })}
            />
          </label>
        }
        onSubmit={onSubmit}
        onCancel={onClose}
        disabled={!majorCategoryForm.name.trim()}
        disabledReason="대분류명을 입력하면 등록할 수 있어요."
        icon={<Plus size={16} />}
        submitting={submitting}
        submitLabel="대분류 등록하기"
      />
    </Modal>
  )
}
