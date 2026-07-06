import type { Dispatch, SetStateAction } from 'react'
import { ClipboardList } from 'lucide-react'
import { FormGrid, Modal } from '../../../components/ui'

export function MajorCategoryRegisterModal({
  open,
  onClose,
  majorCategoryForm,
  setMajorCategoryForm,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  majorCategoryForm: { name: string }
  setMajorCategoryForm: Dispatch<SetStateAction<{ name: string }>>
  onSubmit: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="대분류 등록"
      titleId="major-category-register-title"
      eyebrow="업무 마스터"
      icon={<ClipboardList size={18} />}
      closeLabel="대분류 등록 닫기"
    >
      <FormGrid
        fields={
          <label>
            대분류명
            <input value={majorCategoryForm.name} onChange={(event) => setMajorCategoryForm({ name: event.target.value })} />
          </label>
        }
        onSubmit={onSubmit}
        disabled={!majorCategoryForm.name.trim()}
        submitLabel="대분류 추가"
      />
    </Modal>
  )
}
