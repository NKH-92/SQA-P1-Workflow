import type { Dispatch, SetStateAction } from 'react'
import { Users } from 'lucide-react'
import { FormGrid, Modal } from '../../../components/ui'
import type { Profile } from '../../../types'
import type { DutyTableGroup } from './DutyTable'

export function DutyAssignModal({
  open,
  onClose,
  memberOptions,
  dutyTableGroups,
  dutyAssignment,
  setDutyAssignment,
  onSubmit,
  submitting = false,
}: {
  open: boolean
  onClose: () => void
  memberOptions: Profile[]
  dutyTableGroups: DutyTableGroup[]
  dutyAssignment: { user_id: string; duty_id: string }
  setDutyAssignment: Dispatch<SetStateAction<{ user_id: string; duty_id: string }>>
  onSubmit: () => void
  submitting?: boolean
}) {
  const disabledReason = !dutyAssignment.user_id
    ? '파트원을 고르면 배정할 수 있어요.'
    : '업무를 고르면 배정할 수 있어요.'
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="업무 배정"
      titleId="duty-assign-title"
      description="이미 있는 담당자는 그대로 두고 한 명을 더해요. 빼거나 옮기려면 표의 ‘담당자 변경’을 눌러 주세요."
      eyebrow="업무 카테고리"
      icon={<Users size={18} />}
      closeLabel="업무 배정 닫기"
      dirty={Boolean(dutyAssignment.duty_id) && !submitting}
    >
      <FormGrid
        fields={
          <>
            <label>
              파트원
              <select
                aria-required="true"
                value={dutyAssignment.user_id}
                onChange={(event) => setDutyAssignment({ ...dutyAssignment, user_id: event.target.value })}
              >
                <option value="">선택</option>
                {memberOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              업무
              <select
                aria-required="true"
                value={dutyAssignment.duty_id}
                onChange={(event) => setDutyAssignment({ ...dutyAssignment, duty_id: event.target.value })}
              >
                <option value="">선택</option>
                {dutyTableGroups.map(({ category, duties: categoryDuties }) => (
                  <optgroup key={category.id} label={category.name}>
                    {categoryDuties.map((duty) => (
                      <option key={duty.id} value={duty.id}>
                        {duty.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </>
        }
        onSubmit={onSubmit}
        onCancel={onClose}
        disabled={!dutyAssignment.user_id || !dutyAssignment.duty_id}
        disabledReason={disabledReason}
        submitting={submitting}
        submitLabel="업무 배정하기"
      />
    </Modal>
  )
}
