import type { Dispatch, SetStateAction } from 'react'
import { ClipboardList } from 'lucide-react'
import { FormGrid, Modal } from '../../../components/ui'
import type { AppData } from '../../../types'

export function DutyRegisterModal({
  open,
  onClose,
  data,
  dutyForm,
  setDutyForm,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  data: AppData
  dutyForm: { major_category_id: string; name: string }
  setDutyForm: Dispatch<SetStateAction<{ major_category_id: string; name: string }>>
  onSubmit: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="업무 등록"
      titleId="duty-register-title"
      eyebrow="업무 마스터"
      icon={<ClipboardList size={18} />}
      closeLabel="업무 등록 닫기"
    >
      <FormGrid
        fields={
          <>
            <label>
              대분류
              <select
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
              <input value={dutyForm.name} onChange={(event) => setDutyForm({ ...dutyForm, name: event.target.value })} />
            </label>
          </>
        }
        onSubmit={onSubmit}
        disabled={!dutyForm.major_category_id || !dutyForm.name.trim()}
        submitLabel="업무 추가"
      />
    </Modal>
  )
}
