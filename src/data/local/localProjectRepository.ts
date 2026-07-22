import { recordActivityLog } from '../activityLog'
import { assertRecordExists, UserFacingError } from '../../lib/errors'
import { canAssignProjectTo } from '../../domain/permissions'
import { makeId } from '../../lib/format'
import type { RepositoryDeps, ProjectRepository } from '../repositories/types'
import { assertMasterVersion, MASTER_STALE_MESSAGE, normalizeMasterReason } from '../validation/masterOcc'
import { addProject, removeProject, replaceProjectAssignments, updateProject } from './appDataReducers'

export function createLocalProjectRepository(ctx: RepositoryDeps): ProjectRepository {
  const { profile, data, setData, activityLogs } = ctx

  const assertLeader = () => {
    if (profile.role !== 'leader' || profile.is_active === false || profile.must_change_password === true) {
      throw new UserFacingError('활성 파트장 권한이 필요합니다.')
    }
  }
  const assertMembers = (memberIds: string[]) => {
    for (const memberId of new Set(memberIds)) {
      const member = data.profiles.find((item) => item.id === memberId)
      assertRecordExists(member)
      if (!canAssignProjectTo(member, profile.id)) {
        throw new UserFacingError('활성 파트원 또는 현재 파트장 본인에게만 프로젝트를 배정할 수 있습니다.')
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
      await recordActivityLog(activityLogs, {
        actor: profile,
        entityType: 'project',
        entityId: projectId,
        action: 'created',
        summary: `${project.name} 프로젝트를 생성했습니다.`,
        metadata: { deadline: project.deadline, status: project.status, assigned_user_ids: memberIds },
      })
      return projectId
    },

    async updateProject(projectId, updated, expectedUpdatedAt) {
      assertLeader()
      const currentProject = data.projects.find((item) => item.id === projectId)
      assertRecordExists(currentProject)
      if (currentProject.updated_at !== expectedUpdatedAt) throw new UserFacingError(MASTER_STALE_MESSAGE)
      setData((current) => updateProject(current, projectId, updated))
      await recordActivityLog(activityLogs, {
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
      const currentProject = data.projects.find((item) => item.id === project.id)
      assertRecordExists(currentProject)
      if (!project.updated_at || currentProject.updated_at !== project.updated_at) throw new UserFacingError(MASTER_STALE_MESSAGE)
      assertMembers(nextMemberIds)
      setData((current) => replaceProjectAssignments(current, project, nextMemberIds, memberOptions))
      await recordActivityLog(activityLogs, {
        actor: profile,
        entityType: 'project_assignment',
        entityId: project.id,
        action: 'updated',
        summary: `${project.name} 프로젝트 배정을 ${nextMemberIds.length}명으로 조정했습니다.`,
        metadata: { assigned_user_ids: nextMemberIds },
      })
    },

    async deleteProject(project, input) {
      assertLeader()
      const currentProject = data.projects.find((item) => item.id === project.id)
      assertRecordExists(currentProject)
      normalizeMasterReason(input.reason)
      if (assertMasterVersion(currentProject.updated_at) !== assertMasterVersion(input.expectedUpdatedAt)) {
        throw new UserFacingError(MASTER_STALE_MESSAGE)
      }
      setData((current) => removeProject(current, project.id))
      await recordActivityLog(activityLogs, {
        actor: profile,
        entityType: 'project',
        entityId: project.id,
        action: 'deleted',
        summary: `${project.name} 프로젝트를 삭제했습니다.`,
        metadata: { reason: input.reason.trim() },
      })
    },
  }
}
