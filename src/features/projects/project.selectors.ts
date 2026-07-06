import { projectStatusLabels } from '../../lib/format'
import type { AppData, Profile, ProjectAssignment, ProjectStatus } from '../../types'

export type ProjectFilter = { query: string; status: 'all' | ProjectStatus }

function matchesProjectQuery(
  query: string,
  parts: Array<string | null | undefined>,
) {
  if (!query) return true
  return parts.join(' ').toLowerCase().includes(query)
}

export function selectVisibleProjectAssignments(data: AppData, profile: Profile, leaderMode: boolean) {
  return leaderMode
    ? data.projectAssignments
    : data.projectAssignments.filter((assignment) => assignment.user_id === profile.id)
}

export function selectFilteredProjectAssignments(
  data: AppData,
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
  data: AppData,
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

export function selectProjectStatusGroups(projectGroups: ReturnType<typeof selectProjectGroups>) {
  const statusOrder: ProjectStatus[] = ['in_progress', 'planned', 'done']
  return statusOrder
    .map((status) => ({
      status,
      projects: projectGroups.filter((group) => group.project.status === status),
    }))
    .filter((group) => group.projects.length > 0)
}
