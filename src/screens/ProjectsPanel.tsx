import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Badge, Rows, Section } from '../components/ui'
import type { AppData, Profile, Project, ProjectStatus } from '../types'
import { downloadCsv } from '../lib/csv'
import {
  createProject as createProjectMutation,
  createRepositoryContext,
  deleteProject as deleteProjectMutation,
  saveProjectAssignments,
  updateProject as updateProjectMutation,
} from '../data'
import { formatDate, projectStatusLabels } from '../lib/format'
import { canAssignProjectTo } from '../domain/permissions'
import { dueDateLabel } from '../lib/dates'
import {
  BriefcaseBusiness,
  Check,
  Download,
  FolderKanban,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react'

export function ProjectsPanel({
  profile,
  data,
  mutate,
  setData,
}: {
  profile: Profile
  data: AppData
  mutate: (operation: () => Promise<void>, success: string) => Promise<void>
  setData: Dispatch<SetStateAction<AppData>>
}) {
  const [projectForm, setProjectForm] = useState({ name: '', description: '', deadline: '', status: 'planned' as ProjectStatus })
  const [isProjectComposerOpen, setProjectComposerOpen] = useState(false)
  const [selectedProjectMemberIds, setSelectedProjectMemberIds] = useState<string[]>([])
  const [projectQuery, setProjectQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all')
  const [viewMode, setViewMode] = useState<'project' | 'member'>('project')
  const [projectEdits, setProjectEdits] = useState<Record<string, { name: string; description: string; deadline: string; status: ProjectStatus }>>({})
  const [assignmentEditProjectId, setAssignmentEditProjectId] = useState<string | null>(null)
  const [assignmentEditMemberIds, setAssignmentEditMemberIds] = useState<string[]>([])
  const [pendingProjectDeleteId, setPendingProjectDeleteId] = useState<string | null>(null)
  const leaderMode = profile.role === 'leader'
  const memberOptions = data.profiles.filter(canAssignProjectTo)
  const visibleProjectAssignments = leaderMode
    ? data.projectAssignments
    : data.projectAssignments.filter((assignment) => assignment.user_id === profile.id)

  useEffect(() => {
    if (!leaderMode || !isProjectComposerOpen || selectedProjectMemberIds.length > 0) return
    setSelectedProjectMemberIds(memberOptions.slice(0, 2).map((member) => member.id))
  }, [isProjectComposerOpen, leaderMode, memberOptions, selectedProjectMemberIds.length])

  useEffect(() => {
    if (!isProjectComposerOpen || typeof document === 'undefined') return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProjectComposerOpen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isProjectComposerOpen])

  const toggleProjectMember = (memberId: string) =>
    setSelectedProjectMemberIds((current) =>
      current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId],
    )

  const filteredProjectAssignments = visibleProjectAssignments.filter((assignment) => {
    const project = assignment.projects ?? data.projects.find((item) => item.id === assignment.project_id)
    const member = assignment.profiles ?? data.profiles.find((item) => item.id === assignment.user_id)
    const status = project?.status
    if (statusFilter !== 'all' && status !== statusFilter) return false
    const query = projectQuery.trim().toLowerCase()
    if (!query) return true
    return [
      project?.name,
      project?.description,
      project?.deadline,
      status ? projectStatusLabels[status] : '',
      member?.name,
      member?.email,
      assignment.notes,
    ]
      .join(' ')
      .toLowerCase()
      .includes(query)
  })

  const projectGroups = data.projects
    .filter((project) => leaderMode || filteredProjectAssignments.some((assignment) => assignment.project_id === project.id))
    .filter((project) => statusFilter === 'all' || project.status === statusFilter)
    .map((project) => ({
      project,
      assignments: filteredProjectAssignments.filter((assignment) => assignment.project_id === project.id),
    }))
    .filter((group) => {
      const query = projectQuery.trim().toLowerCase()
      if (!query) return leaderMode || group.assignments.length > 0
      const target = [
        group.project.name,
        group.project.description,
        group.project.deadline,
        projectStatusLabels[group.project.status],
        ...group.assignments.flatMap((assignment) => [
          assignment.profiles?.name,
          assignment.profiles?.email,
          assignment.notes,
        ]),
      ]
        .join(' ')
        .toLowerCase()
      return target.includes(query) && (leaderMode || group.assignments.length > 0)
    })

  const memberGroups = (leaderMode ? memberOptions : [profile])
    .map((member) => ({
      member,
      assignments: filteredProjectAssignments.filter((assignment) => assignment.user_id === member.id),
    }))
    .filter((group) => group.assignments.length > 0)
  const statusOrder: ProjectStatus[] = ['in_progress', 'planned', 'done']
  const projectStatusGroups = statusOrder
    .map((status) => ({
      status,
      projects: projectGroups.filter((group) => group.project.status === status),
    }))
    .filter((group) => group.projects.length > 0)

  const exportProjectCsv = () =>
    downloadCsv(
      'project-assignments.csv',
      filteredProjectAssignments.map((assignment) => {
        const project = assignment.projects ?? data.projects.find((item) => item.id === assignment.project_id)
        const member = assignment.profiles ?? data.profiles.find((item) => item.id === assignment.user_id)
        return {
          project: project?.name ?? assignment.project_id,
          status: project?.status ? projectStatusLabels[project.status] : '',
          deadline: project?.deadline ?? '',
          member: member?.name ?? assignment.user_id,
          email: member?.email ?? '',
          notes: assignment.notes ?? '',
        }
      }),
    )

  const createProject = () =>
    mutate(async () => {
      const ctx = createRepositoryContext(profile, data, setData)
      const selectedMembers = selectedProjectMemberIds.filter((memberId) => memberOptions.some((member) => member.id === memberId))
      await createProjectMutation(ctx, {
        project: {
          name: projectForm.name,
          description: projectForm.description,
          deadline: projectForm.deadline || null,
          status: projectForm.status,
        },
        memberIds: selectedMembers,
        memberOptions,
      })
      setProjectForm({ name: '', description: '', deadline: '', status: 'planned' })
      setSelectedProjectMemberIds([])
      setProjectComposerOpen(false)
    }, '프로젝트를 생성했습니다.')

  const startProjectEdit = (project: Project) =>
    setProjectEdits((current) => ({
      ...current,
      [project.id]: {
        name: project.name,
        description: project.description,
        deadline: project.deadline ?? '',
        status: project.status,
      },
    }))

  const cancelProjectEdit = (projectId: string) =>
    setProjectEdits((current) => {
      const next = { ...current }
      delete next[projectId]
      return next
    })

  const updateProject = (project: Project) =>
    mutate(async () => {
      const edit = projectEdits[project.id]
      if (!edit) return
      await updateProjectMutation(createRepositoryContext(profile, data, setData), project.id, {
        name: edit.name,
        description: edit.description,
        deadline: edit.deadline || null,
        status: edit.status,
      })
      cancelProjectEdit(project.id)
    }, '프로젝트 정보를 수정했습니다.')

  const openAssignmentEdit = (projectId: string, userIds: string[]) => {
    setAssignmentEditProjectId(projectId)
    setAssignmentEditMemberIds(userIds)
  }

  const toggleAssignmentEditMember = (memberId: string) =>
    setAssignmentEditMemberIds((current) =>
      current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId],
    )

  const saveAssignmentEdit = () =>
    mutate(async () => {
      if (!assignmentEditProjectId) return
      const project = data.projects.find((item) => item.id === assignmentEditProjectId)
      if (!project) return
      const nextIds = assignmentEditMemberIds.filter((memberId) => memberOptions.some((member) => member.id === memberId))
      await saveProjectAssignments(createRepositoryContext(profile, data, setData), {
        project,
        nextMemberIds: nextIds,
        memberOptions,
      })
      setAssignmentEditProjectId(null)
      setAssignmentEditMemberIds([])
    }, '프로젝트 배정을 수정했습니다.')

  const deleteProject = (project: Project) =>
    mutate(async () => {
      await deleteProjectMutation(createRepositoryContext(profile, data, setData), project)
      setPendingProjectDeleteId(null)
      cancelProjectEdit(project.id)
    }, '프로젝트를 삭제했습니다.')

  return (
    <div className="stack">
      <div className="page-intro">
        <span>Projects</span>
        <h1>프로젝트</h1>
        <p>
          상태별로 묶어 <strong>{projectGroups.length}개</strong> 프로젝트를 확인합니다.
        </p>
      </div>
      <div className="section-toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            placeholder="프로젝트, 파트원, 메모 검색"
            value={projectQuery}
            onChange={(event) => setProjectQuery(event.target.value)}
          />
        </label>
        <select className="compact-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | ProjectStatus)}>
          <option value="all">전체 상태</option>
          {Object.entries(projectStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button className="ghost" onClick={exportProjectCsv} type="button">
          <Download size={16} />
          CSV
        </button>
        {leaderMode && (
          <button className="primary" onClick={() => setProjectComposerOpen(true)} type="button">
            <Plus size={16} />
            프로젝트
          </button>
        )}
      </div>
      <div className="project-status-board">
        {projectStatusGroups.length === 0 && <p className="empty">조건에 맞는 프로젝트가 없습니다.</p>}
        {projectStatusGroups.map((group) => (
          <section className="project-status-section" key={group.status}>
            <header>
              <div>
                <span>{projectStatusLabels[group.status]}</span>
                <strong>{group.projects.length}개</strong>
              </div>
            </header>
            <div className="project-card-grid">
              {group.projects.map(({ project, assignments }) => {
                const activeCount = assignments.length
                const deadlineMeta = project.deadline ? dueDateLabel(project.deadline) : '기한 없음'
                return (
                  <article className="project-card" key={project.id}>
                    <div className="project-card-head">
                      <Badge status={project.status}>{projectStatusLabels[project.status]}</Badge>
                      <span>{project.deadline ? formatDate(project.deadline) : '기한 없음'}</span>
                    </div>
                    <h3>{project.name}</h3>
                    <p>{project.description || '설명 없음'}</p>
                    <p className="project-card-meta">
                      {activeCount}명 배정 · {deadlineMeta}
                    </p>
                    <div className="avatar-stack">
                      {assignments.slice(0, 4).map((assignment) => (
                        <span key={assignment.id}>{(assignment.profiles?.name ?? assignment.user_id).slice(0, 1)}</span>
                      ))}
                      {assignments.length === 0 && <small>담당자 없음</small>}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ))}
      </div>
      {leaderMode && isProjectComposerOpen && (
        <div className="modal-backdrop" onMouseDown={() => setProjectComposerOpen(false)} role="presentation">
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
                onClick={() => setProjectComposerOpen(false)}
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
                  if (projectForm.name.trim()) void createProject()
                }
              }}
              onSubmit={(event) => {
                event.preventDefault()
                if (!projectForm.name.trim()) return
                void createProject()
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
                    value={projectForm.name}
                    onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })}
                  />
                </div>
                <div className="modal-field-stack">
                  <label htmlFor="project-description-v2">설명</label>
                  <textarea
                    id="project-description-v2"
                    placeholder="목표와 범위를 적어주세요."
                    value={projectForm.description}
                    onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })}
                  />
                  <p>목표, 산출물, 포함 범위를 짧게 적으면 배정 받은 파트원이 바로 움직일 수 있습니다.</p>
                </div>
                <div className="project-form-row">
                  <div className="modal-field-stack">
                    <label htmlFor="project-deadline-v2">마감일</label>
                    <input
                      id="project-deadline-v2"
                      type="date"
                      value={projectForm.deadline}
                      onChange={(event) => setProjectForm({ ...projectForm, deadline: event.target.value })}
                    />
                  </div>
                  <div className="modal-field-stack">
                    <label>상태</label>
                    <div className="status-segmented">
                      {(Object.entries(projectStatusLabels) as Array<[ProjectStatus, string]>).map(([value, label]) => (
                        <button
                          className={projectForm.status === value ? 'selected' : ''}
                          key={value}
                          onClick={() => setProjectForm({ ...projectForm, status: value })}
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
                      .filter((member) => selectedProjectMemberIds.includes(member.id))
                      .map((member) => (
                        <button key={member.id} onClick={() => toggleProjectMember(member.id)} type="button">
                          <span className="target-avatar">{member.name.slice(0, 1)}</span>
                          {member.name}
                          <X size={13} />
                        </button>
                      ))}
                    {selectedProjectMemberIds.length === 0 && <span>이름으로 검색해 배정하세요</span>}
                  </div>
                  <div className="assignee-picker">
                    {memberOptions.map((member) => {
                      const selected = selectedProjectMemberIds.includes(member.id)
                      const currentLoad = data.projectAssignments.filter((assignment) => assignment.user_id === member.id).length
                      return (
                        <button
                          className={selected ? 'selected' : ''}
                          key={member.id}
                          onClick={() => toggleProjectMember(member.id)}
                          type="button"
                        >
                          <span className="check-mark">{selected && <Check size={13} />}</span>
                          <span className="target-avatar">{member.name.slice(0, 1)}</span>
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
                    .filter((member) => selectedProjectMemberIds.includes(member.id))
                    .map((member) => {
                      const currentLoad = data.projectAssignments.filter((assignment) => assignment.user_id === member.id).length
                      const nextLoad = currentLoad + 1
                      const overloaded = nextLoad >= 3
                      return (
                        <article key={member.id}>
                          <header>
                            <span className="target-avatar">{member.name.slice(0, 1)}</span>
                            <strong>{member.name}</strong>
                            <Badge status={overloaded ? 'due_soon' : 'approved'}>{overloaded ? '부하 주의' : '여유'}</Badge>
                          </header>
                          <div className="load-transition">
                            <span>{currentLoad}<small>과제</small></span>
                            <span>→</span>
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
                  {selectedProjectMemberIds.length === 0 && <p className="empty">배정할 파트원을 선택하세요.</p>}
                </div>
                <div className="workload-total">
                  <span>팀 총 배정</span>
                  <strong>{selectedProjectMemberIds.length}명</strong>
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
                  <button className="ghost" onClick={() => setProjectComposerOpen(false)} type="button">
                    닫기
                  </button>
                  <button className="primary" disabled={!projectForm.name.trim()} type="submit">
                    <Plus size={16} />
                    프로젝트 생성 · {selectedProjectMemberIds.length}명 배정
                  </button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      )}
      {leaderMode && assignmentEditProjectId && (
        <div className="modal-backdrop" onMouseDown={() => setAssignmentEditProjectId(null)} role="presentation">
          <section aria-modal="true" className="modal-card project-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <header className="modal-header">
              <div>
                <span>배정 편집</span>
                <h2>{data.projects.find((item) => item.id === assignmentEditProjectId)?.name ?? '프로젝트'}</h2>
              </div>
              <button className="icon-button modal-close" onClick={() => setAssignmentEditProjectId(null)} type="button">
                <X size={18} />
              </button>
            </header>
            <div className="assignee-picker">
              {memberOptions.map((member) => {
                const selected = assignmentEditMemberIds.includes(member.id)
                const load =
                  data.productAssignments.filter((a) => a.user_id === member.id).length +
                  data.dutyAssignments.filter((a) => a.user_id === member.id).length +
                  data.projectAssignments.filter((a) => a.user_id === member.id).length
                return (
                  <button className={selected ? 'assignee-option selected' : 'assignee-option'} key={member.id} onClick={() => toggleAssignmentEditMember(member.id)} type="button">
                    <span className="target-avatar">{member.name.slice(0, 1)}</span>
                    <span>
                      <strong>{member.name}</strong>
                      <small>현재 배정 {load}건</small>
                    </span>
                  </button>
                )
              })}
            </div>
            <footer className="modal-footer project-modal-footer">
              <button className="ghost" onClick={() => setAssignmentEditProjectId(null)} type="button">
                취소
              </button>
              <button className="primary" onClick={() => void saveAssignmentEdit()} type="button">
                <Save size={16} />
                배정 저장 · {assignmentEditMemberIds.length}명
              </button>
            </footer>
          </section>
        </div>
      )}
      <Section title={leaderMode ? '프로젝트별 배정 현황' : '내 배정 업무'} icon={<BriefcaseBusiness size={18} />}>
        <div className="section-toolbar">
          <label className="search-field">
            <Search size={16} />
            <input
              placeholder="프로젝트, 파트원, 메모 검색"
              value={projectQuery}
              onChange={(event) => setProjectQuery(event.target.value)}
            />
          </label>
          <select className="compact-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | ProjectStatus)}>
            <option value="all">전체 상태</option>
            {Object.entries(projectStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div className="view-switch">
            <button className={viewMode === 'project' ? 'selected' : ''} onClick={() => setViewMode('project')} type="button">
              프로젝트별
            </button>
            <button className={viewMode === 'member' ? 'selected' : ''} onClick={() => setViewMode('member')} type="button">
              사람별
            </button>
          </div>
          <button className="ghost" onClick={exportProjectCsv} type="button">
            <Download size={16} />
            CSV
          </button>
        </div>
        {viewMode === 'project' ? (
          <div className="group-list">
            {projectGroups.length === 0 && <p className="empty">조건에 맞는 프로젝트가 없습니다.</p>}
            {projectGroups.map(({ project, assignments }) => {
              const edit = projectEdits[project.id]
              return (
                <article className="group-card" key={project.id}>
                  {edit ? (
                    <div className="project-edit-form">
                      <label>
                        이름
                        <input value={edit.name} onChange={(event) => setProjectEdits({ ...projectEdits, [project.id]: { ...edit, name: event.target.value } })} />
                      </label>
                      <label>
                        마감일
                        <input
                          type="date"
                          value={edit.deadline}
                          onChange={(event) => setProjectEdits({ ...projectEdits, [project.id]: { ...edit, deadline: event.target.value } })}
                        />
                      </label>
                      <label>
                        상태
                        <select value={edit.status} onChange={(event) => setProjectEdits({ ...projectEdits, [project.id]: { ...edit, status: event.target.value as ProjectStatus } })}>
                          {Object.entries(projectStatusLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="wide">
                        설명
                        <textarea value={edit.description} onChange={(event) => setProjectEdits({ ...projectEdits, [project.id]: { ...edit, description: event.target.value } })} />
                      </label>
                      <div className="inline-actions">
                        <button className="primary compact" disabled={!edit.name.trim()} onClick={() => void updateProject(project)} type="button">
                          <Save size={16} />
                          저장
                        </button>
                        <button className="ghost compact" onClick={() => cancelProjectEdit(project.id)} type="button">
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="group-header">
                      <div>
                        <strong>{project.name}</strong>
                        <span>{project.description || '설명 없음'}</span>
                      </div>
                      <div className="group-actions">
                        <Badge status={project.status}>{projectStatusLabels[project.status]}</Badge>
                        {leaderMode && (
                          <>
                            <button
                              className="ghost compact"
                              onClick={() => openAssignmentEdit(project.id, assignments.map((item) => item.user_id))}
                              title="배정 편집"
                              type="button"
                            >
                              <Users size={16} />
                              배정
                            </button>
                            {pendingProjectDeleteId === project.id ? (
                              <div className="delete-confirm" title="배정 이력도 함께 삭제됩니다.">
                                <button className="danger compact" onClick={() => void deleteProject(project)} type="button">
                                  삭제 확인
                                </button>
                                <button className="ghost compact" onClick={() => setPendingProjectDeleteId(null)} type="button">
                                  취소
                                </button>
                              </div>
                            ) : (
                              <button className="ghost compact" onClick={() => setPendingProjectDeleteId(project.id)} title="프로젝트 삭제" type="button">
                                <Trash2 size={16} />
                                삭제
                              </button>
                            )}
                            <button className="ghost compact" onClick={() => startProjectEdit(project)} title="프로젝트 수정" type="button">
                              <Pencil size={16} />
                              수정
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  <Rows
                    empty="아직 배정된 파트원이 없습니다."
                    rows={assignments.map((assignment) => ({
                      title: assignment.profiles?.name ?? assignment.user_id,
                      meta: `${project.deadline ? `마감 ${formatDate(project.deadline)}` : '마감일 없음'}${
                        assignment.notes ? ` · ${assignment.notes}` : ''
                      }`,
                    }))}
                  />
                </article>
              )
            })}
          </div>
        ) : (
          <div className="group-list">
            {memberGroups.length === 0 && <p className="empty">조건에 맞는 파트원 배정이 없습니다.</p>}
            {memberGroups.map(({ member, assignments }) => (
              <article className="group-card" key={member.id}>
                <div className="group-header">
                  <div>
                    <strong>{member.name}</strong>
                    <span>{member.email}</span>
                  </div>
                  <Badge>{assignments.length}건</Badge>
                </div>
                <Rows
                  empty="배정 프로젝트가 없습니다."
                  rows={assignments.map((assignment) => {
                    const project = assignment.projects ?? data.projects.find((item) => item.id === assignment.project_id)
                    return {
                      title: project?.name ?? assignment.project_id,
                      meta: `${project?.deadline ? `마감 ${formatDate(project.deadline)}` : '마감일 없음'}${
                        assignment.notes ? ` · ${assignment.notes}` : ''
                      }`,
                      aside: project?.status ? projectStatusLabels[project.status] : undefined,
                    }
                  })}
                />
              </article>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

