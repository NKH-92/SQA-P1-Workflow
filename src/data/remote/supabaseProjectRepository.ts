import { recordActivityLog } from '../../lib/activityLog'
import { supabase } from '../../lib/supabase'
import type { Project } from '../../types'
import type { LocalRepositoryContext, ProjectRepository } from '../repositories/types'
import type { ProjectInput } from '../local/appDataReducers'

export function createSupabaseProjectRepository(ctx: LocalRepositoryContext): ProjectRepository {
  const { profile, setData } = ctx

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
      const { error } = await supabase!.from('projects').update(updated).eq('id', projectId)
      if (error) throw error
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
      const { error } = await supabase!.rpc('replace_project_assignments', {
        p_project_id: project.id,
        p_member_ids: nextMemberIds,
      })
      if (error) throw error
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
      const { error } = await supabase!.from('projects').delete().eq('id', project.id)
      if (error) throw error
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

export type { ProjectInput, Project }
