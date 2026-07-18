import type { Profile, Project } from '../../types'
import type { ProjectInput } from '../contracts'
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
): Promise<void> {
  return ctx.repositories.projects.updateProject(projectId, updated)
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

export async function deleteProject(ctx: RepositoryContext, project: Project): Promise<void> {
  return ctx.repositories.projects.deleteProject(project)
}
