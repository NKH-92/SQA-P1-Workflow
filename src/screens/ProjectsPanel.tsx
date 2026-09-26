import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Download, FolderKanban, Plus, Search, Users } from 'lucide-react'
import { Badge, EmptyState } from '../components/ui'
import type { AppData, Profile, Project, ProjectStatus } from '../types'
import { downloadCsv } from '../lib/csv'
import type { MutateFn } from '../app/types'
import { formatDate, projectStatusLabels } from '../lib/format'
import { quoted, quotedWithJosa, withJosa } from '../lib/korean'
import { preferredScrollBehavior } from '../lib/motion'
import { canAssignProjectTo, canManageTeamData, canViewTeamData } from '../domain/permissions'
import { useViewState } from '../hooks/useViewState'
import { ProjectBoard } from '../features/projects/components/ProjectBoard'
import { ProjectCard } from '../features/projects/components/ProjectCard'
import { AssignmentEditModal } from '../features/projects/components/AssignmentEditModal'
import { ProjectComposerModal } from '../features/projects/components/ProjectComposerModal'
import { ProjectDeleteModal } from '../features/projects/components/ProjectDeleteModal'
import { ProjectEditModal } from '../features/projects/components/ProjectEditModal'
import { emptyProjectForm, isProjectFormState, type ProjectFormState } from '../features/projects/projectForm'
import {
  dueBadgeStatus,
  isProjectStatusFilter,
  PROJECT_STATUS_LIFECYCLE,
  projectDueState,
  selectFilteredProjectAssignments,
  selectMemberProjectGroups,
  selectProjectCards,
  selectProjectStatusGroups,
  selectVisibleProjectAssignments,
} from '../features/projects/project.selectors'
import { useProjectController } from '../features/projects/useProjectController'
import { useProjectLinkCopy } from '../features/projects/useProjectLinkCopy'

type ViewMode = 'project' | 'member'

type ComposerDraft = { form: ProjectFormState; memberIds: string[] }

const emptyComposerDraft: ComposerDraft = { form: emptyProjectForm, memberIds: [] }

const isString = (value: unknown): value is string => typeof value === 'string'
const isViewMode = (value: unknown): value is ViewMode => value === 'project' || value === 'member'
const isComposerDraft = (value: unknown): value is ComposerDraft =>
  Boolean(value)
  && typeof value === 'object'
  && isProjectFormState((value as ComposerDraft).form)
  && Array.isArray((value as ComposerDraft).memberIds)
  && (value as ComposerDraft).memberIds.every((id) => typeof id === 'string')

/** 담당자 변경 창을 연 순간의 프로젝트(버전 포함)와 선택 */
type AssignmentEdit = { project: Project; memberIds: string[] }

function findProjectCard(projectId: string) {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-project-id]'))
    .find((element) => element.dataset.projectId === projectId) ?? null
}

function projectInput(form: ProjectFormState) {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    deadline: form.deadline || null,
    status: form.status,
  }
}

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
  const leaderMode = canViewTeamData(profile)
  const canManage = canManageTeamData(profile)
  const roleKey = leaderMode ? 'leader' : 'member'
  // 검색어·필터·보기 방식·작성 중인 새 프로젝트는 다른 메뉴에 다녀와도 그대로 남긴다(토스 CL-3).
  const [projectQuery, setProjectQuery] = useViewState(`projects.${roleKey}.query`, '', isString)
  const [statusFilter, setStatusFilter] = useViewState<'all' | ProjectStatus>(`projects.${roleKey}.status`, 'all', isProjectStatusFilter)
  const [viewMode, setViewMode] = useViewState<ViewMode>('projects.leader.view', 'project', isViewMode)
  const [composerDraft, setComposerDraft] = useViewState<ComposerDraft>('projects.leader.composer', emptyComposerDraft, isComposerDraft)
  const [isProjectComposerOpen, setProjectComposerOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [assignmentEdit, setAssignmentEdit] = useState<AssignmentEdit | null>(null)
  const [deletingProject, setDeletingProject] = useState<Project | null>(null)
  const [highlightedProjectId, setHighlightedProjectId] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<{ projectId: string; selector: string } | null>(null)
  const [liveMessage, setLiveMessage] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const deleteReturnFocusRef = useRef<HTMLElement | null>(null)
  const linkCopy = useProjectLinkCopy()

  // 파트원은 자기 프로젝트만 보므로 사람별 보기가 의미 없다 — 항상 프로젝트별로 고정한다.
  const effectiveViewMode: ViewMode = leaderMode ? viewMode : 'project'
  const projectCandidateProfiles = useMemo(
    () => (data.profiles.some((candidate) => candidate.id === profile.id) ? data.profiles : [profile, ...data.profiles]),
    [data.profiles, profile],
  )
  const memberOptions = useMemo(
    () => projectCandidateProfiles.filter((candidate) => canAssignProjectTo(candidate, profile.id)),
    [profile.id, projectCandidateProfiles],
  )
  const projectFilter = { query: projectQuery, status: statusFilter }
  const visibleProjectAssignments = selectVisibleProjectAssignments(data, profile, leaderMode)
  const filteredProjectAssignments = selectFilteredProjectAssignments(data, visibleProjectAssignments, projectFilter)
  const projectCards = selectProjectCards(data, profile, leaderMode, projectFilter)
  const projectStatusGroups = selectProjectStatusGroups(projectCards)
  const memberGroups = selectMemberProjectGroups(memberOptions, profile, leaderMode, filteredProjectAssignments)
  const ownProjectCount = leaderMode
    ? data.projects.length
    : new Set(visibleProjectAssignments.map((assignment) => assignment.project_id)).size
  const hasFilter = projectQuery.trim().length > 0 || statusFilter !== 'all'

  const clearFilters = () => {
    setProjectQuery('')
    setStatusFilter('all')
  }

  // 딥링크 대상이 로드되면 필터를 풀어 카드가 보이게 하고, 스크롤·강조로 안내한다.
  useEffect(() => {
    if (!initialSelectedId) return
    if (!data.projects.some((project) => project.id === initialSelectedId)) return
    setProjectQuery('')
    setStatusFilter('all')
    setViewMode('project')
    setHighlightedProjectId(initialSelectedId)
    onInitialSelectionApplied?.()
  }, [initialSelectedId, data.projects, onInitialSelectionApplied, setProjectQuery, setStatusFilter, setViewMode])

  useEffect(() => {
    if (!highlightedProjectId) return
    const card = findProjectCard(highlightedProjectId)
    if (card && typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'center' })
    }
    const timer = window.setTimeout(() => setHighlightedProjectId(null), 2600)
    return () => window.clearTimeout(timer)
  }, [highlightedProjectId])

  // 상태를 바꾸면 카드가 다른 묶음으로 옮겨 가므로, 옮겨 간 카드의 같은 버튼으로 포커스를 돌려준다.
  useEffect(() => {
    if (!focusRequest) return
    const target = findProjectCard(focusRequest.projectId)?.querySelector<HTMLElement>(focusRequest.selector)
    if (target) {
      target.focus({ preventScroll: true })
      if (typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'nearest' })
      }
    }
    setFocusRequest(null)
  }, [focusRequest, data.projects])

  // 자동 복사가 막히면 카드 안의 링크 칸을 선택해 바로 복사할 수 있게 한다.
  useEffect(() => {
    if (linkCopy.state?.status !== 'manual') return
    const input = findProjectCard(linkCopy.state.projectId)?.querySelector<HTMLInputElement>('[data-manual-link]')
    input?.focus()
    input?.select()
  }, [linkCopy.state])

  const closeProjectComposer = useCallback(() => setProjectComposerOpen(false), [])

  const toggleComposerMember = (memberId: string) =>
    setComposerDraft((current) => ({
      ...current,
      memberIds: current.memberIds.includes(memberId)
        ? current.memberIds.filter((id) => id !== memberId)
        : [...current.memberIds, memberId],
    }))

  const exportProjectCsv = () =>
    downloadCsv(
      'project-assignments.csv',
      filteredProjectAssignments.map((assignment) => {
        const project = assignment.projects ?? data.projects.find((item) => item.id === assignment.project_id)
        const member = assignment.profiles ?? data.profiles.find((item) => item.id === assignment.user_id)
        return {
          project: project?.name ?? '',
          status: project?.status ? projectStatusLabels[project.status] : '',
          deadline: project?.deadline ?? '',
          member: member?.name ?? '',
          email: member?.email ?? '',
          notes: assignment.notes ?? '',
        }
      }),
    )

  const createProject = async () => {
    const input = projectInput(composerDraft.form)
    const selectedMembers = composerDraft.memberIds.filter((memberId) => memberOptions.some((member) => member.id === memberId))
    const created: { id: string | null } = { id: null }
    const ok = await mutate(async () => {
      created.id = await controller.create(input, selectedMembers, memberOptions)
    }, `${quotedWithJosa(input.name, '을/를')} 만들었어요.`)
    if (!ok) return false
    setComposerDraft(emptyComposerDraft)
    setProjectComposerOpen(false)
    if (created.id) {
      // 새 프로젝트가 필터에 가려지지 않게 조건을 풀고, 만든 카드로 안내한다.
      clearFilters()
      setViewMode('project')
      setHighlightedProjectId(created.id)
    }
    return true
  }

  const saveProjectEdit = async (project: Project, form: ProjectFormState) => {
    const input = projectInput(form)
    const ok = await mutate(async () => {
      await controller.update(project.id, input, project.updated_at ?? null)
    }, `${quoted(input.name)} 정보를 저장했어요.`)
    if (ok) {
      setEditingProject(null)
      setFocusRequest({ projectId: project.id, selector: '.project-card-open' })
    }
    return ok
  }

  const changeProjectStatus = async (project: Project, status: ProjectStatus) => {
    const ok = await mutate(async () => {
      await controller.update(project.id, {
        name: project.name,
        description: project.description,
        deadline: project.deadline,
        status,
      }, project.updated_at ?? null)
    }, `${quoted(project.name)} 상태를 ${withJosa(projectStatusLabels[status], '으로/로')} 바꿨어요.`)
    if (ok) setFocusRequest({ projectId: project.id, selector: '.project-status-trigger' })
  }

  const openAssignmentEdit = (project: Project, assigneeIds: string[]) =>
    setAssignmentEdit({ project, memberIds: assigneeIds })

  const toggleAssignmentEditMember = (memberId: string) =>
    setAssignmentEdit((current) => current && {
      ...current,
      memberIds: current.memberIds.includes(memberId)
        ? current.memberIds.filter((id) => id !== memberId)
        : [...current.memberIds, memberId],
    })

  const saveAssignmentEdit = async () => {
    if (!assignmentEdit) return false
    const { project: snapshot, memberIds } = assignmentEdit
    const currentProject = data.projects.find((item) => item.id === snapshot.id)
    const nextIds = memberIds.filter((memberId) => memberOptions.some((member) => member.id === memberId))
    const ok = await mutate(async () => {
      // 창을 연 순간의 버전으로 저장한다. 그 사이 다른 사람이 고쳤다면 저장이 막히고 다시 확인하게 한다.
      await controller.saveAssignments(
        { ...(currentProject ?? snapshot), updated_at: snapshot.updated_at },
        nextIds,
        memberOptions,
      )
    }, nextIds.length === 0
      ? `${quoted(snapshot.name)} 담당자를 모두 뺐어요.`
      : `${quoted(snapshot.name)} 담당자를 ${nextIds.length}명으로 바꿨어요.`)
    if (ok) {
      setAssignmentEdit(null)
      setFocusRequest({ projectId: snapshot.id, selector: '.project-card-assign' })
    }
    return ok
  }

  const openDelete = (project: Project) => {
    deleteReturnFocusRef.current = findProjectCard(project.id)?.querySelector<HTMLElement>('.overflow-menu-trigger') ?? null
    setDeletingProject(project)
  }

  const deleteProject = async (project: Project, reason: string) => {
    const ok = await mutate(async () => {
      await controller.remove(project, { expectedUpdatedAt: project.updated_at ?? null, reason })
    }, `${quotedWithJosa(project.name, '을/를')} 삭제했어요.`)
    if (ok) {
      // 지운 카드의 버튼으로는 돌아갈 수 없으니 화면 제목으로 포커스를 옮긴다.
      deleteReturnFocusRef.current = headingRef.current
      setDeletingProject(null)
    }
    return ok
  }

  const copyProjectLink = async (project: Project) => {
    const copied = await linkCopy.copy(project.id)
    setLiveMessage(
      copied
        ? `${quoted(project.name)} 링크를 복사했어요.`
        : '자동 복사가 막혀 있어요. 카드에 나온 링크를 직접 복사해 주세요.',
    )
  }

  const renderCard = ({ project, assignments }: { project: Project; assignments: AppData['projectAssignments'] }) => {
    const copyState = linkCopy.state?.projectId === project.id ? linkCopy.state : null
    return (
      <ProjectCard
        assignments={assignments}
        canManage={canManage}
        feedback={copyState && (
          copyState.status === 'copied' ? (
            <p className="project-card-feedback">링크를 복사했어요</p>
          ) : (
            <label className="project-card-feedback manual">
              <span>자동 복사가 막혀 있어요. 아래 링크를 직접 복사해 주세요.</span>
              <input
                aria-label="공유 링크"
                data-manual-link
                onBlur={linkCopy.dismiss}
                readOnly
                value={copyState.url}
              />
            </label>
          )
        )}
        highlighted={highlightedProjectId === project.id}
        key={project.id}
        onAssign={() => openAssignmentEdit(project, assignments.map((assignment) => assignment.user_id))}
        onChangeStatus={(status) => void changeProjectStatus(project, status)}
        onCopyLink={() => void copyProjectLink(project)}
        onDelete={() => openDelete(project)}
        onEdit={() => setEditingProject(project)}
        profiles={data.profiles}
        project={project}
      />
    )
  }

  const emptyState = hasFilter ? (
    <EmptyState
      icon={<Search size={22} />}
      title="조건에 맞는 프로젝트가 없어요"
      description="검색어나 상태 필터를 바꿔 보세요."
      action={
        <button className="ghost compact" onClick={clearFilters} type="button">
          조건 지우기
        </button>
      }
    />
  ) : canManage ? (
    <EmptyState
      icon={<FolderKanban size={22} />}
      title="아직 프로젝트가 없어요"
      description="프로젝트를 만들고 담당자를 정하면 상태별로 모아 볼 수 있어요."
      action={
        <button className="primary compact" onClick={() => setProjectComposerOpen(true)} type="button">
          <Plus size={16} />
          첫 프로젝트 만들기
        </button>
      }
    />
  ) : (
    <EmptyState
      icon={<FolderKanban size={22} />}
      title={leaderMode ? '아직 프로젝트가 없어요' : '아직 맡은 프로젝트가 없어요'}
      description={leaderMode ? '파트장이 프로젝트를 만들면 여기에 보여요.' : '프로젝트를 맡으면 여기에 보여요.'}
    />
  )

  return (
    <div className="stack projects-stack">
      <div className="page-intro projects-intro">
        <div>
          <h1 ref={headingRef} tabIndex={-1}>
            프로젝트
          </h1>
          <p>
            {leaderMode ? (
              <>
                프로젝트 <strong>{ownProjectCount}개</strong>를 상태별로 모았어요.
              </>
            ) : ownProjectCount > 0 ? (
              <>
                내가 맡은 프로젝트가 <strong>{ownProjectCount}개</strong> 있어요.
              </>
            ) : (
              '아직 맡은 프로젝트가 없어요.'
            )}
          </p>
        </div>
        {canManage && (
          <button className="primary" onClick={() => setProjectComposerOpen(true)} type="button">
            <Plus size={16} />
            프로젝트 만들기
          </button>
        )}
      </div>
      <div className="section-toolbar projects-toolbar">
        <label className="search-field">
          <Search aria-hidden="true" size={16} />
          <input
            aria-label="프로젝트 검색"
            placeholder="프로젝트, 담당자, 메모 검색"
            value={projectQuery}
            onChange={(event) => setProjectQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="프로젝트 상태 필터"
          className="compact-select"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'all' | ProjectStatus)}
        >
          <option value="all">전체 상태</option>
          {PROJECT_STATUS_LIFECYCLE.map((value) => (
            <option key={value} value={value}>
              {projectStatusLabels[value]}
            </option>
          ))}
        </select>
        {leaderMode && (
          <div className="view-switch" role="group" aria-label="프로젝트 보기 방식">
            <button aria-pressed={viewMode === 'project'} className={viewMode === 'project' ? 'selected' : ''} onClick={() => setViewMode('project')} type="button">
              프로젝트별
            </button>
            <button aria-pressed={viewMode === 'member'} className={viewMode === 'member' ? 'selected' : ''} onClick={() => setViewMode('member')} type="button">
              사람별
            </button>
          </div>
        )}
        <button className="ghost" onClick={exportProjectCsv} type="button">
          <Download size={16} />
          CSV 내려받기
        </button>
      </div>

      {effectiveViewMode === 'project' ? (
        projectCards.length === 0 ? emptyState : <ProjectBoard groups={projectStatusGroups} renderCard={renderCard} />
      ) : memberGroups.length === 0 ? (
        hasFilter ? emptyState : (
          <EmptyState
            icon={<Users size={22} />}
            title="아직 프로젝트를 맡은 사람이 없어요"
            description="프로젝트 카드에서 담당자를 정하면 사람별로 모아 볼 수 있어요."
          />
        )
      ) : (
        <div className="group-list project-member-groups">
          {memberGroups.map(({ member, assignments }) => (
            <article className="group-card" key={member.id}>
              <div className="group-header">
                <div>
                  <h2 className="group-title">{member.name}{member.id === profile.id ? ' (나)' : ''}</h2>
                  <span>{member.email}</span>
                </div>
                <Badge>프로젝트 {assignments.length}개</Badge>
              </div>
              <ul className="project-member-rows">
                {assignments.map((assignment) => {
                  const project = data.projects.find((item) => item.id === assignment.project_id)
                  if (!project) return null
                  const due = projectDueState(project)
                  const content = (
                    <>
                      <span className="project-member-row-main">
                        <strong>{project.name}</strong>
                        <small>
                          {project.deadline ? `마감 ${formatDate(project.deadline)}` : '마감일 없음'}
                          {assignment.notes ? ` · ${assignment.notes}` : ''}
                        </small>
                      </span>
                      <span className="project-member-row-side">
                        {due.kind !== 'none' && due.kind !== 'done' && (
                          <Badge status={dueBadgeStatus(due)}>{due.shortLabel}</Badge>
                        )}
                        <Badge status={project.status}>{projectStatusLabels[project.status]}</Badge>
                      </span>
                    </>
                  )
                  return (
                    <li key={assignment.id}>
                      {canManage ? (
                        <button
                          aria-label={`${project.name} 수정`}
                          className="project-member-row"
                          onClick={() => setEditingProject(project)}
                          type="button"
                        >
                          {content}
                        </button>
                      ) : (
                        <div className="project-member-row">{content}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </article>
          ))}
        </div>
      )}

      <p aria-live="polite" className="projects-live-region" role="status">
        {liveMessage}
      </p>

      {canManage && isProjectComposerOpen && (
        <ProjectComposerModal
          currentUserId={profile.id}
          data={data}
          form={composerDraft.form}
          memberOptions={memberOptions}
          onClose={closeProjectComposer}
          onSubmit={createProject}
          onToggleMember={toggleComposerMember}
          open
          selectedMemberIds={composerDraft.memberIds}
          setForm={(form) => setComposerDraft((current) => ({ ...current, form }))}
        />
      )}
      {canManage && editingProject && (
        <ProjectEditModal
          key={editingProject.id}
          onClose={() => setEditingProject(null)}
          onSave={(form) => saveProjectEdit(editingProject, form)}
          project={editingProject}
        />
      )}
      {canManage && assignmentEdit && (
        <AssignmentEditModal
          currentUserId={profile.id}
          data={data}
          memberOptions={memberOptions}
          onClose={() => setAssignmentEdit(null)}
          onSave={saveAssignmentEdit}
          onToggle={toggleAssignmentEditMember}
          projectName={assignmentEdit.project.name}
          selectedIds={assignmentEdit.memberIds}
        />
      )}
      {canManage && deletingProject && (
        <ProjectDeleteModal
          onClose={() => setDeletingProject(null)}
          onDelete={(reason) => deleteProject(deletingProject, reason)}
          project={deletingProject}
          returnFocusRef={deleteReturnFocusRef}
        />
      )}
    </div>
  )
}
