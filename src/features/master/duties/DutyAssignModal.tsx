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
}: {
  open: boolean
  onClose: () => void
  memberOptions: Profile[]
  dutyTableGroups: DutyTableGroup[]
  dutyAssignment: { user_id: string; duty_id: string }
  setDutyAssignment: Dispatch<SetStateAction<{ user_id: string; duty_id: string }>>
  onSubmit: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="업무 배정"
      titleId="duty-assign-title"
      eyebrow="업무 마스터"
      icon={<Users size={18} />}
      closeLabel="업무 배정 닫기"
    >
      <FormGrid
        fields={
          <>
            <label>
              파트원
              <select
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
        disabled={!dutyAssignment.user_id || !dutyAssignment.duty_id}
        submitLabel="업무 배정"
      />
    </Modal>
  )
}
