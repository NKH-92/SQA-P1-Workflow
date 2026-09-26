import type { Dispatch, SetStateAction } from 'react'
import { ClipboardList, Plus } from 'lucide-react'
import { FormGrid, Modal } from '../../../components/ui'
import type { AppData } from '../../../types'

export function DutyRegisterModal({
  open,
  onClose,
  data,
  dutyForm,
  setDutyForm,
  onSubmit,
  submitting = false,
}: {
  open: boolean
  onClose: () => void
  data: AppData
  dutyForm: { major_category_id: string; name: string }
  setDutyForm: Dispatch<SetStateAction<{ major_category_id: string; name: string }>>
  onSubmit: () => void
  submitting?: boolean
}) {
  const disabledReason = !dutyForm.major_category_id
    ? '대분류를 고르면 등록할 수 있어요.'
    : '업무명을 입력하면 등록할 수 있어요.'
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="업무 등록"
      titleId="duty-register-title"
      eyebrow="업무 카테고리"
      icon={<ClipboardList size={18} />}
      closeLabel="업무 등록 닫기"
      dirty={Boolean(dutyForm.name.trim()) && !submitting}
    >
      <FormGrid
        fields={
          <>
            <label>
              대분류
              <select
                aria-required="true"
                value={dutyForm.major_category_id}
                onChange={(event) => setDutyForm({ ...dutyForm, major_category_id: event.target.value })}
              >
                <option value="">선택</option>
                {data.dutyMajorCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              업무명
              <input
                aria-required="true"
                placeholder="예: 연간 품질 보고서"
                value={dutyForm.name}
                onChange={(event) => setDutyForm({ ...dutyForm, name: event.target.value })}
              />
            </label>
          </>
        }
        onSubmit={onSubmit}
        onCancel={onClose}
        disabled={!dutyForm.major_category_id || !dutyForm.name.trim()}
        disabledReason={disabledReason}
        icon={<Plus size={16} />}
        submitting={submitting}
        submitLabel="업무 등록하기"
      />
    </Modal>
  )
}
