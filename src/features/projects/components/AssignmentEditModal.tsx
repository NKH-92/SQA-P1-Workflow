import { useState } from 'react'
import { Check, Users } from 'lucide-react'
import { DialogActions, Modal } from '../../../components/ui'
import type { AppData, Profile } from '../../../types'

type AssignmentEditModalProps = {
  projectName: string
  memberOptions: Profile[]
  selectedIds: string[]
  onToggle: (memberId: string) => void
  /** 담당자별로 이미 맡은 항목 수를 보여주기 위한 데이터 */
  data: Pick<AppData, 'projectAssignments' | 'productAssignments'>
  onSave: () => void | Promise<unknown>
  onClose: () => void
  /** 지금 로그인한 사람. 목록에서 ‘(나)’로 표시한다. */
  currentUserId?: string
}

function sameMembers(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const set = new Set(left)
  return right.every((id) => set.has(id))
}

/**
 * 프로젝트 담당자 변경 창. 열림 여부는 ProjectsPanel이 결정한다.
 * 선택을 바꾼 뒤 닫으려 하면 “작성 중인 내용이 있어요” 확인을 먼저 보여준다.
 */
export function AssignmentEditModal({
  projectName,
  memberOptions,
  selectedIds,
  onToggle,
  data,
  onSave,
  onClose,
  currentUserId,
}: AssignmentEditModalProps) {
  const [initialIds] = useState(selectedIds)
  const [saving, setSaving] = useState(false)
  const dirty = !sameMembers(initialIds, selectedIds)
  const selectedCount = memberOptions.filter((member) => selectedIds.includes(member.id)).length

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onSave()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      className="project-dialog project-assignment-dialog"
      closeLabel="담당자 변경 닫기"
      description="선택한 사람이 이 프로젝트를 맡아요. 선택을 풀면 담당에서 빠져요."
      dirty={dirty}
      eyebrow="담당자 변경"
      icon={<Users size={18} />}
      onClose={onClose}
      open
      title={projectName}
    >
      <div className="assignee-picker">
        {memberOptions.map((member) => {
          const selected = selectedIds.includes(member.id)
          const projectCount = data.projectAssignments.filter((assignment) => assignment.user_id === member.id).length
          const productCount = data.productAssignments.filter((assignment) => assignment.user_id === member.id).length
          const isMe = currentUserId ? member.id === currentUserId : member.role === 'leader'
          return (
            <button
              aria-pressed={selected}
              className={selected ? 'assignee-option selected' : 'assignee-option'}
              key={member.id}
              onClick={() => onToggle(member.id)}
              type="button"
            >
              <span className="check-mark" aria-hidden="true">
                {selected && <Check size={13} />}
              </span>
              <span>
                <strong>
                  {member.name}
                  {isMe ? ' (나)' : ''}
                </strong>
                <small>
                  맡은 프로젝트 {projectCount}개 · 담당 제품 {productCount}개
                </small>
              </span>
            </button>
          )
        })}
        {memberOptions.length === 0 && <p className="empty">배정할 수 있는 파트원이 없어요.</p>}
      </div>
      <DialogActions onClose={onClose} hint={selectedCount === 0 ? '아무도 선택하지 않으면 담당자 없이 저장해요.' : undefined}>
        <button aria-busy={saving || undefined} className="primary" disabled={saving} onClick={() => void save()} type="button">
          {saving ? '저장하는 중…' : `담당자 저장하기 · ${selectedCount}명`}
        </button>
      </DialogActions>
    </Modal>
  )
}
