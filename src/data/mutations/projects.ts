import type { Profile, Project } from '../../types'
import type { AuditedDeleteInput, ProjectInput } from '../contracts'
import type { RepositoryContext } from '../repositoryContext'

export type { ProjectInput }

export async function createProject(
  ctx: RepositoryContext,
  input: {
    project: ProjectInput
    memberIds: string[]
    memberOptions: Profile[]
  },
): Promise<string | null> {
  return ctx.repositories.projects.createProject(input)
}

export async function updateProject(
  ctx: RepositoryContext,
  projectId: string,
  updated: ProjectInput,
  expectedUpdatedAt: string | null,
): Promise<void> {
  return ctx.repositories.projects.updateProject(projectId, updated, expectedUpdatedAt)
}

export async function saveProjectAssignments(
  ctx: RepositoryContext,
  input: {
    project: Project
    nextMemberIds: string[]
    memberOptions: Profile[]
  },
): Promise<void> {
  return ctx.repositories.projects.saveProjectAssignments(input)
}

export async function deleteProject(
  ctx: RepositoryContext,
  project: Project,
  input: AuditedDeleteInput,
): Promise<void> {
  return ctx.repositories.projects.deleteProject(project, input)
}
