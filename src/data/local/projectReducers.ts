import { makeId } from '../../lib/format'
import type { ProjectInput } from '../contracts'
import type { AppData, Profile, Project, ProjectAssignment } from '../../types'

export function addProject(data: AppData, profile: Profile, projectId: string, project: ProjectInput): AppData {
  return {
    ...data,
    projects: [
      {
        id: projectId,
        name: project.name,
        description: project.description,
        deadline: project.deadline,
        status: project.status,
        created_by: profile.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      ...data.projects,
    ],
  }
}

export function updateProject(data: AppData, projectId: string, updated: ProjectInput): AppData {
  return {
    ...data,
    projects: data.projects.map((item) =>
      item.id === projectId ? { ...item, ...updated, updated_at: new Date().toISOString() } : item,
    ),
    projectAssignments: data.projectAssignments.map((assignment) =>
      assignment.project_id === projectId
        ? {
            ...assignment,
            projects: {
              name: updated.name,
              description: updated.description,
              deadline: updated.deadline,
              status: updated.status,
            },
          }
        : assignment,
    ),
  }
}

export function removeProject(data: AppData, projectId: string): AppData {
  return {
    ...data,
    projects: data.projects.filter((item) => item.id !== projectId),
    projectAssignments: data.projectAssignments.filter((assignment) => assignment.project_id !== projectId),
  }
}

export function replaceProjectAssignments(
  data: AppData,
  project: Project,
  nextMemberIds: string[],
  memberOptions: Profile[],
): AppData {
  const desiredIds = [...new Set(nextMemberIds)]
  const currentIds = data.projectAssignments
    .filter((assignment) => assignment.project_id === project.id)
    .map((assignment) => assignment.user_id)
  const toAdd = desiredIds.filter((id) => !currentIds.includes(id))
  const toRemove = data.projectAssignments.filter(
    (assignment) => assignment.project_id === project.id && !desiredIds.includes(assignment.user_id),
  )
  const updatedAt = new Date().toISOString()

  return {
    ...data,
    projects: data.projects.map((item) =>
      item.id === project.id ? { ...item, updated_at: updatedAt } : item,
    ),
    projectAssignments: [
      ...data.projectAssignments.filter((assignment) => !toRemove.some((item) => item.id === assignment.id)),
      ...toAdd.map((memberId) => {
        const member = memberOptions.find((item) => item.id === memberId)
        return {
          id: makeId('project-assignment'),
          project_id: project.id,
          user_id: memberId,
          notes: null,
          created_at: new Date().toISOString(),
          profiles: member ? { name: member.name, email: member.email } : null,
          projects: {
            name: project.name,
            description: project.description,
            deadline: project.deadline,
            status: project.status,
          },
        } satisfies ProjectAssignment
      }),
    ],
  }
}
