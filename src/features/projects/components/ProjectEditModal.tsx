import { useRef, useState, type FormEvent } from 'react'
import { Pencil } from 'lucide-react'
import { DialogActions, Modal } from '../../../components/ui'
import type { Project } from '../../../types'
import { PROJECT_NAME_REQUIRED_MESSAGE, sameProjectForm, type ProjectFormState } from '../projectForm'
import { ProjectFormFields } from './ProjectFormFields'

function formFromProject(project: Project): ProjectFormState {
  return {
    name: project.name,
    description: project.description ?? '',
    deadline: project.deadline ?? '',
    status: project.status,
  }
}

/**
 * 프로젝트 정보(이름·설명·마감일·상태) 수정 창. 카드 본문을 누르면 열린다.
 * 열 때의 프로젝트(버전 포함)를 기준으로 저장하므로, 그 사이 다른 사람이 고쳤다면 저장이 막힌다.
 */
export function ProjectEditModal({
  project,
  onClose,
  onSave,
}: {
  project: Project
  onClose: () => void
  /** 저장에 성공하면 true. 창을 닫는 일은 부모가 한다. */
  onSave: (form: ProjectFormState) => Promise<boolean>
}) {
  const [initialForm] = useState(() => formFromProject(project))
  const [form, setForm] = useState(initialForm)
  const [nameError, setNameError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const dirty = !sameProjectForm(form, initialForm)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    if (!form.name.trim()) {
      setNameError(PROJECT_NAME_REQUIRED_MESSAGE)
      nameInputRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      className="project-dialog"
      closeLabel="프로젝트 정보 수정 닫기"
      dirty={dirty}
      eyebrow={project.name}
      icon={<Pencil size={18} />}
      onClose={onClose}
      open
      title="프로젝트 정보 수정"
    >
      <form aria-busy={saving || undefined} className="project-dialog-form" noValidate onSubmit={(event) => void submit(event)}>
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
        </div>
        <DialogActions onClose={onClose}>
          <button className="primary" disabled={saving} type="submit">
            {saving ? '저장하는 중…' : '저장하기'}
          </button>
        </DialogActions>
      </form>
    </Modal>
  )
}
