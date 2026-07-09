import { Save, X } from 'lucide-react'
import type { AppData, Profile } from '../../../types'

type AssignmentEditModalProps = {
  projectName: string
  memberOptions: Profile[]
  selectedIds: string[]
  onToggle: (memberId: string) => void
  /** 파트원별 현재 배정 건수 계산용 */
  data: AppData
  onSave: () => void
  onClose: () => void
}

/** 프로젝트 배정 편집 모달. 열림 여부는 ProjectsPanel의 assignmentEditProjectId가 결정한다. */
export function AssignmentEditModal({
  projectName,
  memberOptions,
  selectedIds,
  onToggle,
  data,
  onSave,
  onClose,
}: AssignmentEditModalProps) {
  return (
    <div className="modal-backdrop" onMouseDown={() => onClose()} role="presentation">
      <section aria-modal="true" className="modal-card project-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <header className="modal-header">
          <div>
            <span>배정 편집</span>
            <h2>{projectName}</h2>
          </div>
          <button className="icon-button modal-close" onClick={() => onClose()} type="button">
            <X size={18} />
          </button>
        </header>
        <div className="assignee-picker">
          {memberOptions.map((member) => {
            const selected = selectedIds.includes(member.id)
            const load =
              data.productAssignments.filter((a) => a.user_id === member.id).length +
              data.dutyAssignments.filter((a) => a.user_id === member.id).length +
              data.projectAssignments.filter((a) => a.user_id === member.id).length
            return (
              <button className={selected ? 'assignee-option selected' : 'assignee-option'} key={member.id} onClick={() => onToggle(member.id)} type="button">
                <span>
                  <strong>{member.name}</strong>
                  <small>현재 배정 {load}건</small>
                </span>
              </button>
            )
          })}
        </div>
        <footer className="modal-footer project-modal-footer">
          <button className="ghost" onClick={() => onClose()} type="button">
            취소
          </button>
          <button className="primary" onClick={() => onSave()} type="button">
            <Save size={16} />
            배정 저장 · {selectedIds.length}명
          </button>
        </footer>
      </section>
    </div>
  )
}
