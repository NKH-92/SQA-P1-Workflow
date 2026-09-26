import { useId, type RefObject } from 'react'
import { projectStatusLabels } from '../../../lib/format'
import { PROJECT_STATUS_LIFECYCLE } from '../project.selectors'
import type { ProjectFormState } from '../projectForm'

/**
 * 프로젝트 만들기·수정 창이 함께 쓰는 입력 칸. 모든 칸에 실제 라벨을 연결하고,
 * 상태 선택은 보이는 제목으로 이름 붙인 그룹이다(연결 없는 label을 쓰지 않는다).
 */
export function ProjectFormFields({
  form,
  onChange,
  nameError,
  nameInputRef,
}: {
  form: ProjectFormState
  onChange: (form: ProjectFormState) => void
  nameError?: string | null
  nameInputRef?: RefObject<HTMLInputElement>
}) {
  const nameId = useId()
  const nameErrorId = useId()
  const descriptionId = useId()
  const descriptionHintId = useId()
  const deadlineId = useId()
  const statusLabelId = useId()

  return (
    <>
      <div className="modal-field-stack">
        <label htmlFor={nameId}>
          프로젝트 이름 <span aria-hidden="true">*</span>
        </label>
        <input
          ref={nameInputRef}
          aria-describedby={nameError ? nameErrorId : undefined}
          aria-invalid={nameError ? true : undefined}
          aria-required="true"
          data-autofocus
          id={nameId}
          maxLength={200}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          placeholder="예: 모바일 알림 v2"
          value={form.name}
        />
        {nameError && (
          <p className="field-error" id={nameErrorId}>
            {nameError}
          </p>
        )}
      </div>
      <div className="modal-field-stack">
        <label htmlFor={descriptionId}>설명</label>
        <textarea
          aria-describedby={descriptionHintId}
          id={descriptionId}
          onChange={(event) => onChange({ ...form, description: event.target.value })}
          placeholder="목표와 범위를 적어 주세요"
          value={form.description}
        />
        <p id={descriptionHintId}>목표, 산출물, 범위를 짧게 적어 두면 담당자가 바로 시작할 수 있어요.</p>
      </div>
      <div className="project-form-row">
        <div className="modal-field-stack">
          <label htmlFor={deadlineId}>마감일</label>
          <input
            id={deadlineId}
            onChange={(event) => onChange({ ...form, deadline: event.target.value })}
            type="date"
            value={form.deadline}
          />
        </div>
        <div aria-labelledby={statusLabelId} className="modal-field-stack" role="group">
          <span className="modal-field-label" id={statusLabelId}>
            상태
          </span>
          <div className="status-segmented">
            {PROJECT_STATUS_LIFECYCLE.map((value) => (
              <button
                aria-pressed={form.status === value}
                className={form.status === value ? 'selected' : ''}
                key={value}
                onClick={() => onChange({ ...form, status: value })}
                type="button"
              >
                {projectStatusLabels[value]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
