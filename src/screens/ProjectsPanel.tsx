import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Badge, CopyLinkButton, EmptyState, Rows, Section } from '../components/ui'
import type { AppData, Profile, Project, ProjectStatus } from '../types'
import { downloadCsv } from '../lib/csv'
import type { MutateFn } from '../app/types'
import { formatDate, projectStatusLabels } from '../lib/format'
import { canAssignProjectTo } from '../domain/permissions'
import { ProjectBoard } from '../features/projects/components/ProjectBoard'
import { AssignmentEditModal } from '../features/projects/components/AssignmentEditModal'
import { ProjectComposerModal } from '../features/projects/components/ProjectComposerModal'
import {
  selectFilteredProjectAssignments,
  selectMemberProjectGroups,
  selectProjectGroups,
  selectProjectStatusGroups,
  selectVisibleProjectAssignments,
} from '../features/projects/project.selectors'
import { useProjectController } from '../features/projects/useProjectController'
import {
  BriefcaseBusiness,
  Download,
  FolderKanban,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Users,
} from 'lucide-react'

export function ProjectsPanel({
  profile,
  data,
  mutate,
  setData,
  initialSelectedId,
  onInitialSelectionApplied,
}: {
  profile: Profile
  data: AppData
  mutate: MutateFn
  setData: Dispatch<SetStateAction<AppData>>
  initialSelectedId?: string | null
  onInitialSelectionApplied?: () => void
}) {
  const controller = useProjectController(profile, data, setData)
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
  // 파트원은 자기 프로젝트만 보므로 사람별 보기가 의미 없다 — 항상 프로젝트별로 고정한다.
  const effectiveViewMode = leaderMode ? viewMode : 'project'
  const projectCandidateProfiles = data.profiles.some((candidate) => candidate.id === profile.id)
    ? data.profiles
    : [profile, ...data.profiles]
  const memberOptions = projectCandidateProfiles.filter((candidate) =>
    canAssignProjectTo(candidate, profile.id),
  )
  const visibleProjectAssignments = selectVisibleProjectAssignments(data, profile, leaderMode)
  const projectFilter = { query: projectQuery, status: statusFilter }
  const filteredProjectAssignments = selectFilteredProjectAssignments(data, visibleProjectAssignments, projectFilter)
  const projectGroups = selectProjectGroups(data, profile, leaderMode, projectFilter, filteredProjectAssignments)
  const memberGroups = selectMemberProjectGroups(memberOptions, profile, leaderMode, filteredProjectAssignments)
  const projectStatusGroups = selectProjectStatusGroups(projectGroups)
  const [highlightedProjectId, setHighlightedProjectId] = useState<string | null>(null)

  // 딥링크 대상이 로드되면 필터를 풀어 카드가 보이게 하고, 스크롤·강조로 안내한다.
  // 프로젝트는 상세 뷰가 없는 보드형이라 '선택' 대신 카드 강조가 착지 동작이다.
  useEffect(() => {
    if (!initialSelectedId) return
    if (!data.projects.some((project) => project.id === initialSelectedId)) return
    setProjectQuery('')
    setStatusFilter('all')
    setViewMode('project')
    setHighlightedProjectId(initialSelectedId)
    onInitialSelectionApplied?.()
  }, [initialSelectedId, data.projects, onInitialSelectionApplied])

  useEffect(() => {
    if (!highlightedProjectId) return
    document
      .querySelector(`[data-project-id="${highlightedProjectId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = window.setTimeout(() => setHighlightedProjectId(null), 2600)
    return () => window.clearTimeout(timer)
  }, [highlightedProjectId])

  const closeProjectComposer = useCallback(() => setProjectComposerOpen(false), [])

  const toggleProjectMember = (memberId: string) =>
    setSelectedProjectMemberIds((current) =>
      current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId],
    )

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
      const selectedMembers = selectedProjectMemberIds.filter((memberId) => memberOptions.some((member) => member.id === memberId))
      await controller.create({
        name: projectForm.name,
        description: projectForm.description,
        deadline: projectForm.deadline || null,
        status: projectForm.status,
      }, selectedMembers, memberOptions)
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
      await controller.update(project.id, {
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
      await controller.saveAssignments(project, nextIds, memberOptions)
      setAssignmentEditProjectId(null)
      setAssignmentEditMemberIds([])
    }, '프로젝트 배정을 수정했습니다.')

  const deleteProject = (project: Project) =>
    mutate(async () => {
      await controller.remove(project)
      setPendingProjectDeleteId(null)
      cancelProjectEdit(project.id)
    }, '프로젝트를 삭제했습니다.')

  return (
    <div className="stack">
      <div className="page-intro">
        <h1>프로젝트</h1>
        <p>
          상태별로 묶어 <strong>{projectGroups.length}개</strong> 프로젝트를 확인합니다.
        </p>
      </div>
      <div className="section-toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            placeholder="프로젝트, 담당자, 메모 검색"
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
      <ProjectBoard groups={projectStatusGroups} />
      {leaderMode && (
        <ProjectComposerModal
          open={isProjectComposerOpen}
          form={projectForm}
          setForm={setProjectForm}
          memberOptions={memberOptions}
          selectedMemberIds={selectedProjectMemberIds}
          onToggleMember={toggleProjectMember}
          data={data}
          onClose={closeProjectComposer}
          onSubmit={() => void createProject()}
        />
      )}
      {leaderMode && assignmentEditProjectId && (
        <AssignmentEditModal
          projectName={data.projects.find((item) => item.id === assignmentEditProjectId)?.name ?? '프로젝트'}
          memberOptions={memberOptions}
          selectedIds={assignmentEditMemberIds}
          onToggle={toggleAssignmentEditMember}
          data={data}
          onSave={() => void saveAssignmentEdit()}
          onClose={() => setAssignmentEditProjectId(null)}
        />
      )}
      <Section title={leaderMode ? '프로젝트별 배정 현황' : '내 배정 업무'} icon={<BriefcaseBusiness size={18} />}>
        {/* 보기 전환 토글은 파트장 전용. */}
        {leaderMode && (
          <div className="section-toolbar">
            {/* Search / status / CSV live in the page toolbar above and drive both views via
                shared state; this section only owns the project-vs-member view toggle. */}
            <div className="view-switch">
              <button className={viewMode === 'project' ? 'selected' : ''} onClick={() => setViewMode('project')} type="button">
                프로젝트별
              </button>
              <button className={viewMode === 'member' ? 'selected' : ''} onClick={() => setViewMode('member')} type="button">
                사람별
              </button>
            </div>
          </div>
        )}
        {effectiveViewMode === 'project' ? (
          <div className="group-list">
            {projectGroups.length === 0 && (
              <EmptyState
                icon={<FolderKanban size={22} />}
                title="조건에 맞는 프로젝트가 없습니다."
                description="검색어나 상태 필터를 바꿔 보세요."
              />
            )}
            {projectGroups.map(({ project, assignments }) => {
              const edit = projectEdits[project.id]
              return (
                <article
                  className={highlightedProjectId === project.id ? 'group-card deeplink-target' : 'group-card'}
                  data-project-id={project.id}
                  key={project.id}
                >
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
                        <CopyLinkButton tab="projects" entityId={project.id} />
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
                    empty="아직 배정된 담당자가 없습니다."
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
            {memberGroups.length === 0 && (
              <EmptyState
                icon={<Users size={22} />}
                title="조건에 맞는 담당자 배정이 없습니다."
                description="검색어나 상태 필터를 바꿔 보세요."
              />
            )}
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

