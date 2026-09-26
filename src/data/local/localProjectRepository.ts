import { recordActivityLog } from '../activityLog'
import { assertRecordExists, PERMISSION_MESSAGE, UserFacingError } from '../../lib/errors'
import { canAssignProjectTo } from '../../domain/permissions'
import { makeId } from '../../lib/format'
import { quoted } from '../../lib/korean'
import type { RepositoryDeps, ProjectRepository } from '../repositories/types'
import { assertMasterVersion, MASTER_STALE_MESSAGE, normalizeMasterReason } from '../validation/masterOcc'
import { addProject, removeProject, replaceProjectAssignments, updateProject } from './appDataReducers'

/** 비활성 파트원이나 다른 파트장을 담당자로 고른 경우. 원격 RPC의 거부와 같은 조건이다. */
export const PROJECT_ASSIGNEE_MESSAGE =
  '활성 상태인 파트원과 파트장 자신에게만 프로젝트를 배정할 수 있어요. 비활성 파트원을 빼고 다시 저장해 주세요.'

export function createLocalProjectRepository(ctx: RepositoryDeps): ProjectRepository {
  const { profile, data, setData, activityLogs } = ctx

  const assertLeader = () => {
    if (profile.role !== 'leader' || profile.is_active === false || profile.must_change_password === true) {
      throw new UserFacingError(PERMISSION_MESSAGE)
    }
  }
  const assertMembers = (memberIds: string[]) => {
    for (const memberId of new Set(memberIds)) {
      const member = data.profiles.find((item) => item.id === memberId)
      assertRecordExists(member)
      if (!canAssignProjectTo(member, profile.id)) {
        throw new UserFacingError(PROJECT_ASSIGNEE_MESSAGE)
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
        summary: `${quoted(project.name)} 프로젝트를 만들었어요.`,
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
        summary: `${quoted(updated.name)} 프로젝트 정보를 수정했어요.`,
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
        summary: `${quoted(project.name)} 프로젝트 담당자를 ${nextMemberIds.length}명으로 바꿨어요.`,
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
        summary: `${quoted(project.name)} 프로젝트를 삭제했어요.`,
        metadata: { reason: input.reason.trim() },
      })
    },
  }
}
