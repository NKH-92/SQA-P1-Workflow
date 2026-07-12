import { recordActivityLog } from '../../lib/activityLog'
import { assertRecordExists, UserFacingError } from '../../lib/errors'
import { canAssignProjectTo } from '../../domain/permissions'
import { makeId } from '../../lib/format'
import type { RepositoryDeps, ProjectRepository } from '../repositories/types'
import { addProject, removeProject, replaceProjectAssignments, updateProject } from './appDataReducers'

export function createLocalProjectRepository(ctx: RepositoryDeps): ProjectRepository {
  const { profile, data, setData } = ctx

  const assertLeader = () => {
    if (profile.role !== 'leader' || profile.is_active === false || profile.must_change_password === true) {
      throw new UserFacingError('활성 파트장 권한이 필요합니다.')
    }
  }
  const assertMembers = (memberIds: string[]) => {
    for (const memberId of new Set(memberIds)) {
      const member = data.profiles.find((item) => item.id === memberId)
      assertRecordExists(member)
      if (!canAssignProjectTo(member)) {
        throw new UserFacingError('활성 상태인 파트원에게만 프로젝트를 배정할 수 있습니다.')
      }
    }
  }

  return {
    async createProject({ project, memberIds, memberOptions }) {
      assertLeader()
      assertMembers(memberIds)
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
      assertLeader()
      assertRecordExists(data.projects.find((item) => item.id === projectId))
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
      assertLeader()
      assertRecordExists(data.projects.find((item) => item.id === project.id))
      assertMembers(nextMemberIds)
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
      assertLeader()
      assertRecordExists(data.projects.find((item) => item.id === project.id))
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
