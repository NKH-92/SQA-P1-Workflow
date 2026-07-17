import type { Profile, Project } from '../../types'
import type { ProjectInput } from '../contracts'
import type { RepositoryContext } from '../repositoryContext'
import { createLocalProjectRepository } from '../local/localProjectRepository'
import { createSupabaseProjectRepository } from '../remote/supabaseProjectRepository'

export type { ProjectInput }

function projectRepository(ctx: RepositoryContext) {
  return ctx.isRemote ? createSupabaseProjectRepository(ctx) : createLocalProjectRepository(ctx)
}

export async function createProject(
  ctx: RepositoryContext,
  input: {
    project: ProjectInput
    memberIds: string[]
    memberOptions: Profile[]
  },
): Promise<string | null> {
  return projectRepository(ctx).createProject(input)
}

export async function updateProject(
  ctx: RepositoryContext,
  projectId: string,
  updated: ProjectInput,
): Promise<void> {
  return projectRepository(ctx).updateProject(projectId, updated)
}

export async function saveProjectAssignments(
  ctx: RepositoryContext,
  input: {
    project: Project
    nextMemberIds: string[]
    memberOptions: Profile[]
  },
): Promise<void> {
  return projectRepository(ctx).saveProjectAssignments(input)
}

export async function deleteProject(ctx: RepositoryContext, project: Project): Promise<void> {
  return projectRepository(ctx).deleteProject(project)
}
