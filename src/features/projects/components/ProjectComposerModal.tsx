import { Check, FolderKanban, Plus, X } from 'lucide-react'
import { Badge } from '../../../components/ui'
import { useModalDismiss } from '../../../hooks/useModalDismiss'
import { projectStatusLabels } from '../../../lib/format'
import type { AppData, Profile, ProjectStatus } from '../../../types'

export type ProjectFormState = {
  name: string
  description: string
  deadline: string
  status: ProjectStatus
}

type ProjectComposerModalProps = {
  open: boolean
  form: ProjectFormState
  setForm: (form: ProjectFormState) => void
  memberOptions: Profile[]
  selectedMemberIds: string[]
  onToggleMember: (memberId: string) => void
  /** 배정 건수 미리보기 계산용 */
  data: AppData
  onClose: () => void
  onSubmit: () => void
}

/** 프로젝트 생성 모달. 상태·뮤테이션은 ProjectsPanel이 소유하고 여기는 표현만 담당한다. */
export function ProjectComposerModal({
  open,
  form,
  setForm,
  memberOptions,
  selectedMemberIds,
  onToggleMember,
  data,
  onClose,
  onSubmit,
}: ProjectComposerModalProps) {
  useModalDismiss(open, onClose)

  if (!open) return null

  const projectLoad = (memberId: string) =>
    data.projectAssignments.filter((assignment) => assignment.user_id === memberId).length

  return (
    <div className="modal-backdrop" onMouseDown={() => onClose()} role="presentation">
      <section
        aria-labelledby="project-composer-title"
        aria-modal="true"
        className="modal-card project-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal-header">
          <div className="modal-mark" aria-hidden="true">
            <FolderKanban size={18} />
          </div>
          <div>
            <span>새 프로젝트</span>
            <h2 id="project-composer-title">무엇을 함께 만들까요?</h2>
          </div>
          <button
            aria-label="프로젝트 생성 닫기"
            className="icon-button modal-close"
            onClick={() => onClose()}
            type="button"
          >
            <X size={18} />
          </button>
        </header>
        <form
          className="project-compose-grid"
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              if (form.name.trim()) onSubmit()
            }
          }}
          onSubmit={(event) => {
            event.preventDefault()
            if (!form.name.trim()) return
            onSubmit()
          }}
        >
          <div className="project-compose-main">
            <div className="modal-field-stack">
              <label htmlFor="project-title-v2">
                프로젝트 이름 <span>*</span>
              </label>
              <input
                autoFocus
                id="project-title-v2"
                placeholder="예: 모바일 알림 v2"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="modal-field-stack">
              <label htmlFor="project-description-v2">설명</label>
              <textarea
                id="project-description-v2"
                placeholder="목표와 범위를 적어주세요."
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
              <p>목표, 산출물, 포함 범위를 짧게 적으면 배정 받은 파트원이 바로 움직일 수 있습니다.</p>
            </div>
            <div className="project-form-row">
              <div className="modal-field-stack">
                <label htmlFor="project-deadline-v2">마감일</label>
                <input
                  id="project-deadline-v2"
                  type="date"
                  value={form.deadline}
                  onChange={(event) => setForm({ ...form, deadline: event.target.value })}
                />
              </div>
              <div className="modal-field-stack">
                <label>상태</label>
                <div className="status-segmented">
                  {(Object.entries(projectStatusLabels) as Array<[ProjectStatus, string]>).map(([value, label]) => (
                    <button
                      className={form.status === value ? 'selected' : ''}
                      key={value}
                      onClick={() => setForm({ ...form, status: value })}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-field-stack">
              <label>파트원 배정</label>
              <div className="assignee-chip-box">
                {memberOptions
                  .filter((member) => selectedMemberIds.includes(member.id))
                  .map((member) => (
                    <button key={member.id} onClick={() => onToggleMember(member.id)} type="button">
                      {member.name}
                      <X size={13} />
                    </button>
                  ))}
                {selectedMemberIds.length === 0 && <span>배정 인원을 선택하세요</span>}
              </div>
              <div className="assignee-picker">
                {memberOptions.map((member) => {
                  const selected = selectedMemberIds.includes(member.id)
                  const currentLoad = projectLoad(member.id)
                  return (
                    <button
                      className={selected ? 'selected' : ''}
                      key={member.id}
                      onClick={() => onToggleMember(member.id)}
                      type="button"
                    >
                      <span className="check-mark">{selected && <Check size={13} />}</span>
                      <span>
                        <strong>{member.name}</strong>
                        <small>현재 과제 {currentLoad}개 · 담당 제품 {data.productAssignments.filter((assignment) => assignment.user_id === member.id).length}개</small>
                      </span>
                      {currentLoad >= 3 && <Badge status="due_soon">부하</Badge>}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <aside className="workload-preview">
            <span>워크로드 미리보기</span>
            <h3>이 프로젝트를 배정하면</h3>
            <div className="workload-preview-list">
              {memberOptions
                .filter((member) => selectedMemberIds.includes(member.id))
                .map((member) => {
                  const currentLoad = projectLoad(member.id)
                  const nextLoad = currentLoad + 1
                  const overloaded = nextLoad >= 3
                  return (
                    <article key={member.id}>
                      <header>
                        <strong>{member.name}</strong>
                        <Badge status={overloaded ? 'due_soon' : 'approved'}>{overloaded ? '부하 주의' : '여유'}</Badge>
                      </header>
                      <div className={overloaded ? 'load-transition warning' : 'load-transition'}>
                        <span>{currentLoad}<small>과제</small></span>
                        <span className="arrow">→</span>
                        <span className={overloaded ? 'warning' : 'good'}>{nextLoad}<small>과제</small></span>
                        <strong>+1</strong>
                      </div>
                      <div className="load-bar">
                        <span className="current" style={{ width: `${Math.min(100, (currentLoad / 5) * 100)}%` }} />
                        <span
                          className={overloaded ? 'next warning' : 'next'}
                          style={{
                            left: `${Math.min(100, (currentLoad / 5) * 100)}%`,
                            width: `${Math.min(100 - Math.min(100, (currentLoad / 5) * 100), 20)}%`,
                          }}
                        />
                      </div>
                    </article>
                  )
                })}
              {selectedMemberIds.length === 0 && <p className="empty">배정할 파트원을 선택하세요.</p>}
            </div>
            <div className="workload-total">
              <span>팀 총 배정</span>
              <strong>{selectedMemberIds.length}명</strong>
              <p>생성과 동시에 선택한 파트원에게 프로젝트가 배정됩니다.</p>
            </div>
          </aside>
          <footer className="modal-footer project-modal-footer">
            <span className="modal-shortcut">
              <kbd>Ctrl</kbd>
              <kbd>Enter</kbd>
              생성
              <span>·</span>
              <kbd>Esc</kbd>
              닫기
            </span>
            <div>
              <button className="ghost" onClick={() => onClose()} type="button">
                닫기
              </button>
              <button className="primary" disabled={!form.name.trim()} type="submit">
                <Plus size={16} />
                프로젝트 생성 · {selectedMemberIds.length}명 배정
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  )
}
