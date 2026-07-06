import { recordActivityLog } from '../../lib/activityLog'
import { makeId } from '../../lib/format'
import type { Profile, Project } from '../../types'
import type { LocalRepositoryContext, ProjectRepository } from '../repositories/types'
import { addProject, removeProject, replaceProjectAssignments, updateProject } from './appDataReducers'

export function createLocalProjectRepository(ctx: LocalRepositoryContext): ProjectRepository {
  const { profile, data, setData } = ctx

  return {
    async createProject({ project, memberIds, memberOptions }) {
      const projectId = makeId('project')
      setData((current) => addProject(current, profile, projectId, project))
      if (memberIds.length > 0) {
        setData((current) => {
          const created = current.projects.find((item) => item.id === projectId)
          if (!created) return current
          return replaceProjectAssignments(current, created, memberIds, memberOptions)
        })
      }
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'project',
        entityId: projectId,
        action: 'created',
        summary: `${project.name} 프로젝트를 생성했습니다.`,
        metadata: { deadline: project.deadline, status: project.status, assigned_user_ids: memberIds },
      })
      return projectId
    },

    async updateProject(projectId, updated) {
      setData((current) => updateProject(current, projectId, updated))
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'project',
        entityId: projectId,
        action: 'updated',
        summary: `${updated.name} 프로젝트 정보를 수정했습니다.`,
        metadata: updated,
      })
    },

    async saveProjectAssignments({ project, nextMemberIds, memberOptions }) {
      setData((current) => replaceProjectAssignments(current, project, nextMemberIds, memberOptions))
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'project_assignment',
        entityId: project.id,
        action: 'updated',
        summary: `${project.name} 프로젝트 배정을 ${nextMemberIds.length}명으로 조정했습니다.`,
        metadata: { assigned_user_ids: nextMemberIds },
      })
    },

    async deleteProject(project) {
      setData((current) => removeProject(current, project.id))
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'project',
        entityId: project.id,
        action: 'deleted',
        summary: `${project.name} 프로젝트를 삭제했습니다.`,
      })
    },
  }
}

export type { Project, Profile }
