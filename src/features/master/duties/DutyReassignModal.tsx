import { useId, useState } from 'react'
import { UserRoundCog } from 'lucide-react'
import { FormGrid, Modal } from '../../../components/ui'
import { quoted, quotedWithJosa, withJosa } from '../../../lib/korean'
import type { AppData, Duty, Profile } from '../../../types'

export type DutyReassignResult = {
  nextMemberIds: string[]
  reason: string
}

/**
 * 업무 행의 ‘담당자 변경’. 담당자를 여러 명 고르고(빼기·옮기기 포함) 변경 사유와 함께 한 번에 저장한다.
 * 비활성 계정은 다시 배정할 수 없어서 목록에 없고, 저장하면 담당에서 빠진다는 것을 미리 알려준다.
 */
export function DutyReassignModal({
  duty,
  data,
  memberOptions,
  onClose,
  onSubmit,
  submitting = false,
}: {
  duty: Duty
  data: AppData
  memberOptions: Profile[]
  onClose: () => void
  onSubmit: (result: DutyReassignResult) => void
  submitting?: boolean
}) {
  const reasonId = useId()
  const currentIds = data.dutyAssignments
    .filter((assignment) => assignment.duty_id === duty.id)
    .map((assignment) => assignment.user_id)
  const activeIds = new Set(memberOptions.map((member) => member.id))
  const inactiveCurrent = currentIds
    .filter((userId) => !activeIds.has(userId))
    .map((userId) => data.profiles.find((profile) => profile.id === userId)?.name
      ?? data.dutyAssignments.find((assignment) => assignment.duty_id === duty.id && assignment.user_id === userId)?.profiles?.name
      ?? '알 수 없는 사용자')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(currentIds.filter((userId) => activeIds.has(userId))))
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const nextIds = memberOptions.map((member) => member.id).filter((userId) => selected.has(userId))
  const added = nextIds.filter((userId) => !currentIds.includes(userId))
  const removed = currentIds.filter((userId) => !selected.has(userId))
  const changed = added.length > 0 || removed.length > 0
  const nameOf = (userId: string) => data.profiles.find((profile) => profile.id === userId)?.name ?? '알 수 없는 사용자'

  const disabled = !changed || !reason.trim()
  const disabledReason = !changed
    ? '담당자를 바꾸면 저장할 수 있어요.'
    : '변경 사유를 적으면 저장할 수 있어요.'

  return (
    <Modal
      open
      onClose={onClose}
      title={`${quoted(duty.name)} 담당자를 바꿀까요?`}
      description="여러 명을 고를 수 있어요. 모두 빼면 담당자가 없는 업무가 돼요."
      eyebrow="업무 카테고리"
      icon={<UserRoundCog size={18} />}
      closeLabel="담당자 변경 닫기"
      dirty={(touched || Boolean(reason.trim())) && !submitting}
    >
      <FormGrid
        fields={
          <>
            <fieldset className="wide duty-reassign-members">
              <legend>담당자</legend>
              {memberOptions.length === 0 && <p className="duty-reassign-note">배정할 수 있는 활성 파트원이 없어요.</p>}
              {memberOptions.map((member) => (
                <label className="duty-reassign-option" key={member.id}>
                  <input
                    checked={selected.has(member.id)}
                    onChange={(event) => {
                      const checked = event.target.checked
                      setTouched(true)
                      setSelected((current) => {
                        const next = new Set(current)
                        if (checked) next.add(member.id)
                        else next.delete(member.id)
                        return next
                      })
                    }}
                    type="checkbox"
                  />
                  <span>{member.name}</span>
                  {currentIds.includes(member.id) && <small>지금 담당</small>}
                </label>
              ))}
            </fieldset>
            {inactiveCurrent.length > 0 && (
              <p className="wide duty-reassign-note">
                비활성 계정 {inactiveCurrent.join(', ')}님은 저장하면 담당에서 빠져요.
              </p>
            )}
            {duty.assignee_label && (
              <p className="wide duty-reassign-note">담당 표시 {quotedWithJosa(duty.assignee_label, '은/는')} 그대로 남아요.</p>
            )}
            {changed && (
              <p className="wide duty-reassign-summary" role="status">
                {added.length > 0 && <span>새로 맡는 사람 <strong>{added.map(nameOf).join(', ')}</strong></span>}
                {removed.length > 0 && <span>빠지는 사람 <strong>{removed.map(nameOf).join(', ')}</strong></span>}
                {nextIds.length === 0 && <span>{withJosa(duty.name, '은/는')} 담당자가 없는 업무가 돼요.</span>}
              </p>
            )}
            <label className="wide" htmlFor={reasonId}>
              변경 사유
              <textarea
                aria-required="true"
                id={reasonId}
                maxLength={500}
                placeholder="예: 담당 제품군이 바뀌어서 업무를 옮겨요."
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <small>감사 이력에 남아요 · {reason.length}/500자</small>
            </label>
          </>
        }
        onSubmit={() => onSubmit({ nextMemberIds: nextIds, reason: reason.trim() })}
        onCancel={onClose}
        disabled={disabled}
        disabledReason={disabledReason}
        submitting={submitting}
        submitLabel="담당자 저장하기"
      />
    </Modal>
  )
}
