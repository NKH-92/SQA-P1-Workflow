import { recordActivityLog } from '../../lib/activityLog'
import { assertAffectedRows, assertRecordExists, UserFacingError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { RepositoryDeps, ProjectRepository } from '../repositories/types'

export function createSupabaseProjectRepository(ctx: RepositoryDeps): ProjectRepository {
  const { profile, data, setData } = ctx

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
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'project',
        entityId: projectId,
        action: 'created',
        summary: `${project.name} 프로젝트를 생성했습니다.`,
        metadata: { deadline: project.deadline, status: project.status, assigned_user_ids: memberIds },
      }, { isRemote: true })
      return projectId
    },

    async updateProject(projectId, updated) {
      const projectSnapshot = data.projects.find((item) => item.id === projectId)
      assertRecordExists(projectSnapshot)
      const expectedUpdatedAt = projectSnapshot.updated_at
      const { data: affected, error } = await supabase!
        .from('projects')
        .update(updated)
        .eq('id', projectId)
        .eq('updated_at', expectedUpdatedAt)
        .select('id')
      if (error) {
        if (error.message.includes('project changed since it was opened')) {
          throw new UserFacingError('다른 사용자가 먼저 프로젝트를 수정했습니다. 목록을 새로고침한 뒤 배정을 다시 저장해 주세요.')
        }
        throw error
      }
      assertAffectedRows(affected)
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'project',
        entityId: projectId,
        action: 'updated',
        summary: `${updated.name} 프로젝트 정보를 수정했습니다.`,
        metadata: updated,
      }, { isRemote: true })
    },

    async saveProjectAssignments({ project, nextMemberIds }) {
      if (!project.updated_at) {
        throw new UserFacingError('프로젝트 버전이 없어 배정을 저장할 수 없습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.')
      }
      const { data: updatedAt, error } = await supabase!.rpc('replace_project_assignments_if_current', {
        p_project_id: project.id,
        p_member_ids: nextMemberIds,
        p_expected_updated_at: project.updated_at,
      })
      if (error) {
        if (error.message.includes('project changed since it was opened')) {
          throw new UserFacingError('다른 사용자가 먼저 프로젝트를 수정했습니다. 목록을 새로고침한 뒤 배정을 다시 저장해 주세요.')
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
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'project_assignment',
        entityId: project.id,
        action: 'updated',
        summary: `${project.name} 프로젝트 배정을 ${nextMemberIds.length}명으로 조정했습니다.`,
        metadata: { assigned_user_ids: nextMemberIds },
      }, { isRemote: true })
    },

    async deleteProject(project) {
      const { data: affected, error } = await supabase!
        .from('projects')
        .delete()
        .eq('id', project.id)
        .select('id')
      if (error) throw error
      assertAffectedRows(affected)
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'project',
        entityId: project.id,
        action: 'deleted',
        summary: `${project.name} 프로젝트를 삭제했습니다.`,
      }, { isRemote: true })
    },
  }
}
