import { projectStatusLabels } from '../../lib/format'
import { dueState, type DueState } from '../../lib/dates'
import type { AppData, Profile, Project, ProjectAssignment, ProjectStatus } from '../../types'

export type ProjectFeatureData = Pick<AppData, 'projects' | 'profiles' | 'projectAssignments'>

export type ProjectFilter = { query: string; status: 'all' | ProjectStatus }

export type ProjectGroup = { project: Project; assignments: ProjectAssignment[] }

/** 상태 묶음의 표시 순서: 지금 하는 일 → 앞으로 할 일 → 끝난 일. */
export const PROJECT_STATUS_ORDER: ProjectStatus[] = ['in_progress', 'planned', 'done']

/** 상태를 고르는 곳(메뉴·입력)의 순서: 진행 순서 그대로 예정 → 진행 중 → 완료. */
export const PROJECT_STATUS_LIFECYCLE: ProjectStatus[] = ['planned', 'in_progress', 'done']

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return value === 'planned' || value === 'in_progress' || value === 'done'
}

export function isProjectStatusFilter(value: unknown): value is 'all' | ProjectStatus {
  return value === 'all' || isProjectStatus(value)
}

function matchesProjectQuery(
  query: string,
  parts: Array<string | null | undefined>,
) {
  if (!query) return true
  return parts.join(' ').toLowerCase().includes(query)
}

export function selectVisibleProjectAssignments(data: ProjectFeatureData, profile: Profile, leaderMode: boolean) {
  return leaderMode
    ? data.projectAssignments
    : data.projectAssignments.filter((assignment) => assignment.user_id === profile.id)
}

export function selectFilteredProjectAssignments(
  data: ProjectFeatureData,
  assignments: ProjectAssignment[],
  filter: ProjectFilter,
) {
  const query = filter.query.trim().toLowerCase()
  return assignments.filter((assignment) => {
    const project = assignment.projects ?? data.projects.find((item) => item.id === assignment.project_id)
    const member = assignment.profiles ?? data.profiles.find((item) => item.id === assignment.user_id)
    const status = project?.status
    if (filter.status !== 'all' && status !== filter.status) return false
    return matchesProjectQuery(query, [
      project?.name,
      project?.description,
      project?.deadline,
      status ? projectStatusLabels[status] : '',
      member?.name,
      member?.email,
      assignment.notes,
    ])
  })
}

export function selectProjectGroups(
  data: ProjectFeatureData,
  profile: Profile,
  leaderMode: boolean,
  filter: ProjectFilter,
  filteredAssignments: ProjectAssignment[],
) {
  const query = filter.query.trim().toLowerCase()
  return data.projects
    .filter((project) => leaderMode || filteredAssignments.some((assignment) => assignment.project_id === project.id))
    .filter((project) => filter.status === 'all' || project.status === filter.status)
    .map((project) => ({
      project,
      assignments: filteredAssignments.filter((assignment) => assignment.project_id === project.id),
    }))
    .filter((group) => {
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
      return matchesProjectQuery(query, target) && (leaderMode || group.assignments.length > 0)
    })
}

/**
 * 카드에 보여줄 담당자 목록. 검색으로 걸러진 배정이 아니라 그 프로젝트의 배정 전체를 쓴다.
 * (검색어가 사람 이름일 때 나머지 담당자가 카드에서 사라지거나, 담당자 변경 창이 일부만 선택된 채 열리면 안 된다.)
 */
export function selectProjectCards(
  data: ProjectFeatureData,
  profile: Profile,
  leaderMode: boolean,
  filter: ProjectFilter,
): ProjectGroup[] {
  const visibleAssignments = selectVisibleProjectAssignments(data, profile, leaderMode)
  const filteredAssignments = selectFilteredProjectAssignments(data, visibleAssignments, filter)
  const assignmentsByProject = new Map<string, ProjectAssignment[]>()
  for (const assignment of visibleAssignments) {
    const current = assignmentsByProject.get(assignment.project_id) ?? []
    current.push(assignment)
    assignmentsByProject.set(assignment.project_id, current)
  }
  return selectProjectGroups(data, profile, leaderMode, filter, filteredAssignments).map(({ project }) => ({
    project,
    assignments: assignmentsByProject.get(project.id) ?? [],
  }))
}

export function selectMemberProjectGroups(
  memberOptions: Profile[],
  profile: Profile,
  leaderMode: boolean,
  filteredAssignments: ProjectAssignment[],
) {
  return (leaderMode ? memberOptions : [profile])
    .map((member) => ({
      member,
      assignments: filteredAssignments.filter((assignment) => assignment.user_id === member.id),
    }))
    .filter((group) => group.assignments.length > 0)
}

/** 마감일이 가까운 순(기한 없는 프로젝트는 뒤), 같으면 이름순. */
export function compareProjectsByDeadline(left: Project, right: Project) {
  if (left.deadline && right.deadline && left.deadline !== right.deadline) {
    return left.deadline.localeCompare(right.deadline)
  }
  if (left.deadline && !right.deadline) return -1
  if (!left.deadline && right.deadline) return 1
  return left.name.localeCompare(right.name, 'ko')
}

export function selectProjectStatusGroups(projectGroups: ProjectGroup[]) {
  return PROJECT_STATUS_ORDER
    .map((status) => ({
      status,
      projects: projectGroups
        .filter((group) => group.project.status === status)
        .sort((left, right) => compareProjectsByDeadline(left.project, right.project)),
    }))
    .filter((group) => group.projects.length > 0)
}

/** 프로젝트 마감 상태. 완료한 프로젝트는 기한이 지나도 ‘지남’으로 보이지 않는다. */
export function projectDueState(project: Pick<Project, 'deadline' | 'status'>, now = new Date()) {
  return dueState(project.deadline, { done: project.status === 'done', now })
}

/** 담당자 이름(가나다순). 이름을 알 수 없으면 ‘이름 없는 담당자’로 보여 내부 ID가 드러나지 않게 한다. */
export function projectAssigneeNames(
  assignments: ProjectAssignment[],
  profiles: Pick<Profile, 'id' | 'name'>[],
) {
  return assignments
    .map((assignment) => assignment.profiles?.name ?? profiles.find((item) => item.id === assignment.user_id)?.name ?? '이름 없는 담당자')
    .sort((left, right) => left.localeCompare(right, 'ko'))
}

/** 기한 칩(Badge data-status) 색. 끝난 일은 완료색, 지났거나 오늘·내일 마감은 긴급색, 7일 안은 주의색. */
export function dueBadgeStatus(state: DueState) {
  if (state.tone === 'done') return 'done'
  if (state.tone === 'urgent') return 'overdue'
  if (state.tone === 'warning') return 'due_soon'
  return 'scheduled'
}
