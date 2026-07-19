import { useMemo } from 'react'
import {
  createProject,
  createRepositoryContext,
  deleteProject,
  saveProjectAssignments,
  updateProject,
} from '../../data'
import type { ProjectInput } from '../../data/contracts'
import type { AppData, Profile, Project } from '../../types'
import type { AppDataUpdater } from '../../data/repositories/appDataUpdater'

export function useProjectController(profile: Profile, data: AppData, setData: AppDataUpdater) {
  const context = useMemo(
    () => createRepositoryContext(profile, data, setData),
    [data, profile, setData],
  )
  return {
    create: (project: ProjectInput, memberIds: string[], memberOptions: Profile[]) =>
      createProject(context, { project, memberIds, memberOptions }),
    update: (projectId: string, project: ProjectInput) => updateProject(context, projectId, project),
    saveAssignments: (project: Project, nextMemberIds: string[], memberOptions: Profile[]) =>
      saveProjectAssignments(context, { project, nextMemberIds, memberOptions }),
    remove: (project: Project) => deleteProject(context, project),
  }
}
