import { recordActivityLog } from '../activityLog'
import { assertAffectedRows, UserFacingError } from '../../lib/errors'
import { quoted } from '../../lib/korean'
import { supabase } from '../../lib/supabase'
import type { RepositoryDeps, ProjectRepository } from '../repositories/types'
import { translateMasterOccError } from './masterOccError'
import { assertMasterVersion, MASTER_STALE_MESSAGE, normalizeMasterReason } from '../validation/masterOcc'

const PROJECT_CHANGED_MESSAGE = '다른 사람이 먼저 프로젝트를 수정했어요. 목록을 새로고침한 뒤 다시 저장해 주세요.'

export function createSupabaseProjectRepository(ctx: RepositoryDeps): ProjectRepository {
  const { profile, setData, activityLogs } = ctx

  return {
    async createProject({ project, memberIds }) {
      const { data: createdId, error } = await supabase!.rpc('create_project_with_assignments', {
        p_name: project.name,
        p_description: project.description,
        p_deadline: project.deadline,
        p_status: project.status,
        p_member_ids: memberIds,
      })
      if (error) throw error
      const projectId = typeof createdId === 'string' ? createdId : null
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
      if (!expectedUpdatedAt) throw new UserFacingError(MASTER_STALE_MESSAGE)
      const { data: affected, error } = await supabase!
        .from('projects')
        .update(updated)
        .eq('id', projectId)
        .eq('updated_at', expectedUpdatedAt)
        .select('id')
      if (error) {
        if (error.message.includes('project changed since it was opened')) {
          throw new UserFacingError(PROJECT_CHANGED_MESSAGE)
        }
        throw error
      }
      assertAffectedRows(affected)
      await recordActivityLog(activityLogs, {
        actor: profile,
        entityType: 'project',
        entityId: projectId,
        action: 'updated',
        summary: `${quoted(updated.name)} 프로젝트 정보를 수정했어요.`,
        metadata: updated,
      })
    },

    async saveProjectAssignments({ project, nextMemberIds }) {
      if (!project.updated_at) {
        throw new UserFacingError('프로젝트 정보가 최신이 아니라 저장하지 못했어요. 목록을 새로고침한 뒤 다시 시도해 주세요.')
      }
      const { data: updatedAt, error } = await supabase!.rpc('replace_project_assignments_if_current', {
        p_project_id: project.id,
        p_member_ids: nextMemberIds,
        p_expected_updated_at: project.updated_at,
      })
      if (error) {
        if (error.message.includes('project changed since it was opened')) {
          throw new UserFacingError(PROJECT_CHANGED_MESSAGE)
        }
        throw error
      }
      if (typeof updatedAt === 'string') {
        setData((current) => ({
          ...current,
          projects: current.projects.map((item) =>
            item.id === project.id ? { ...item, updated_at: updatedAt } : item,
          ),
        }))
      }
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
      const { error } = await supabase!.rpc('delete_project_if_current', {
        p_id: project.id,
        p_expected_updated_at: assertMasterVersion(input.expectedUpdatedAt),
        p_reason: normalizeMasterReason(input.reason),
        p_correlation_id: crypto.randomUUID(),
      })
      if (error) throw translateMasterOccError(error)
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
