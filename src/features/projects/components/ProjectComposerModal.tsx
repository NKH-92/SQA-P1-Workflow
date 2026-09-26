import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Check, FolderKanban, Plus } from 'lucide-react'
import { DialogActions, Modal } from '../../../components/ui'
import type { AppData, Profile } from '../../../types'
import { PROJECT_NAME_REQUIRED_MESSAGE, type ProjectFormState } from '../projectForm'
import { ProjectFormFields } from './ProjectFormFields'

type ProjectComposerModalProps = {
  open: boolean
  form: ProjectFormState
  setForm: (form: ProjectFormState) => void
  memberOptions: Profile[]
  selectedMemberIds: string[]
  onToggleMember: (memberId: string) => void
  /** 지금 로그인한 사람. 담당자 목록에서 ‘(나)’로 표시한다. */
  currentUserId: string
  /** 담당자별로 이미 맡은 항목 수를 보여주기 위한 데이터 */
  data: Pick<AppData, 'projectAssignments' | 'productAssignments'>
  onClose: () => void
  /** 만들기에 성공하면 true. 창을 닫고 입력을 비우는 일은 부모가 한다. */
  onSubmit: () => Promise<boolean>
}

/**
 * 프로젝트 만들기 창. 입력은 부모(ProjectsPanel)가 세션 동안 보관하므로 창을 닫거나 다른 메뉴에
 * 다녀와도 사라지지 않는다(자동 보관) — 그래서 닫을 때 확인을 묻지 않는다.
 * 담당자 목록의 숫자는 ‘이미 맡은 항목 수’일 뿐 업무량 판단으로 쓰지 않는다(DESIGN.md §2).
 */
export function ProjectComposerModal({
  open,
  form,
  setForm,
  memberOptions,
  selectedMemberIds,
  onToggleMember,
  currentUserId,
  data,
  onClose,
  onSubmit,
}: ProjectComposerModalProps) {
  const [nameError, setNameError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const assigneeLabelId = useId()
  const assigneeHintId = useId()

  if (!open) return null

  const projectCount = (memberId: string) =>
    data.projectAssignments.filter((assignment) => assignment.user_id === memberId).length
  const productCount = (memberId: string) =>
    data.productAssignments.filter((assignment) => assignment.user_id === memberId).length
  const selectedCount = memberOptions.filter((member) => selectedMemberIds.includes(member.id)).length

  const submit = async () => {
    if (submitting) return
    if (!form.name.trim()) {
      setNameError(PROJECT_NAME_REQUIRED_MESSAGE)
      nameInputRef.current?.focus()
      return
    }
    setSubmitting(true)
    try {
      await onSubmit()
    } finally {
      setSubmitting(false)
    }
  }

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void submit()
  }

  const onFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <Modal
      className="project-dialog project-composer-dialog"
      closeLabel="새 프로젝트 닫기"
      eyebrow="새 프로젝트"
      icon={<FolderKanban size={18} />}
      onClose={onClose}
      open={open}
      title="무엇을 함께 만들까요?"
    >
      <form
        aria-busy={submitting || undefined}
        className="project-dialog-form"
        noValidate
        onKeyDown={onFormKeyDown}
        onSubmit={onFormSubmit}
      >
        <div className="project-dialog-body">
          <ProjectFormFields
            form={form}
            nameError={nameError}
            nameInputRef={nameInputRef}
            onChange={(next) => {
              setForm(next)
              if (nameError && next.name.trim()) setNameError(null)
            }}
          />
          <div aria-describedby={assigneeHintId} aria-labelledby={assigneeLabelId} className="modal-field-stack" role="group">
            <span className="modal-field-label" id={assigneeLabelId}>
              담당자
            </span>
            <p id={assigneeHintId}>만들면 선택한 담당자에게 바로 배정해요. 나중에 바꿀 수도 있어요.</p>
            <div className="assignee-picker">
              {memberOptions.map((member) => {
                const selected = selectedMemberIds.includes(member.id)
                return (
                  <button
                    aria-pressed={selected}
                    className={selected ? 'selected' : ''}
                    key={member.id}
                    onClick={() => onToggleMember(member.id)}
                    type="button"
                  >
                    <span className="check-mark" aria-hidden="true">
                      {selected && <Check size={13} />}
                    </span>
                    <span>
                      <strong>
                        {member.name}
                        {member.id === currentUserId ? ' (나)' : ''}
                      </strong>
                      <small>
                        맡은 프로젝트 {projectCount(member.id)}개 · 담당 제품 {productCount(member.id)}개
                      </small>
                    </span>
                  </button>
                )
              })}
              {memberOptions.length === 0 && <p className="empty">배정할 수 있는 파트원이 없어요.</p>}
            </div>
          </div>
        </div>
        <DialogActions
          hint={
            <span className="modal-shortcut">
              <kbd>Ctrl</kbd>
              <kbd>Enter</kbd>
              만들기
            </span>
          }
          onClose={onClose}
        >
          <button className="primary" disabled={submitting} type="submit">
            <Plus size={16} />
            {submitting
              ? '만드는 중…'
              : selectedCount > 0
                ? `프로젝트 만들기 · 담당자 ${selectedCount}명`
                : '프로젝트 만들기'}
          </button>
        </DialogActions>
      </form>
    </Modal>
  )
}
