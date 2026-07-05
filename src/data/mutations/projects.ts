import { recordActivityLog } from '../../lib/activityLog'
import { makeId } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { Profile, Project, ProjectAssignment, ProjectStatus } from '../../types'
import type { RepositoryContext } from '../repositoryContext'

export type ProjectInput = {
  name: string
  description: string
  deadline: string | null
  status: ProjectStatus
}

export async function createProject(
  ctx: RepositoryContext,
  input: {
    project: ProjectInput
    memberIds: string[]
    memberOptions: Profile[]
  },
): Promise<string | null> {
  const { profile, setData } = ctx
  const { project, memberIds, memberOptions } = input
  let projectId: string | null

  if (ctx.isRemote) {
    const { data: createdId, error } = await supabase!.rpc('create_project_with_assignments', {
      p_name: project.name,
      p_description: project.description,
      p_deadline: project.deadline,
      p_status: project.status,
      p_member_ids: memberIds,
    })
    if (error) throw error
    projectId = typeof createdId === 'string' ? createdId : null
  } else {
    const newProjectId = makeId('project')
    projectId = newProjectId
    setData((current) => ({
      ...current,
      projects: [
        {
          id: newProjectId,
          name: project.name,
          description: project.description,
          deadline: project.deadline,
          status: project.status,
          created_by: profile.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        ...current.projects,
      ],
    }))
    if (memberIds.length > 0) {
      setData((current) => ({
        ...current,
        projectAssignments: [
          ...memberIds.map((memberId) => {
            const member = memberOptions.find((item) => item.id === memberId)
            return {
              id: makeId('project-assignment'),
              project_id: newProjectId,
              user_id: memberId,
              notes: null,
              created_at: new Date().toISOString(),
              profiles: member ? { name: member.name, email: member.email } : null,
              projects: {
                name: project.name,
                description: project.description,
                deadline: project.deadline,
                status: project.status,
              },
            } satisfies ProjectAssignment
          }),
          ...current.projectAssignments,
        ],
      }))
    }
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
}

export async function updateProject(
  ctx: RepositoryContext,
  projectId: string,
  updated: ProjectInput,
): Promise<void> {
  const { profile, setData } = ctx

  if (ctx.isRemote) {
    const { error } = await supabase!.from('projects').update(updated).eq('id', projectId)
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      projects: current.projects.map((item) =>
        item.id === projectId ? { ...item, ...updated, updated_at: new Date().toISOString() } : item,
      ),
      projectAssignments: current.projectAssignments.map((assignment) =>
        assignment.project_id === projectId
          ? {
              ...assignment,
              projects: {
                name: updated.name,
                description: updated.description,
                deadline: updated.deadline,
                status: updated.status,
              },
            }
          : assignment,
      ),
    }))
  }

  await recordActivityLog(setData, {
    actor: profile,
    entityType: 'project',
    entityId: projectId,
    action: 'updated',
    summary: `${updated.name} 프로젝트 정보를 수정했습니다.`,
    metadata: updated,
  })
}

export async function saveProjectAssignments(
  ctx: RepositoryContext,
  input: {
    project: Project
    nextMemberIds: string[]
    memberOptions: Profile[]
  },
): Promise<void> {
  const { profile, data, setData } = ctx
  const { project, nextMemberIds, memberOptions } = input
  const currentIds = data.projectAssignments
    .filter((assignment) => assignment.project_id === project.id)
    .map((assignment) => assignment.user_id)
  const toAdd = nextMemberIds.filter((id) => !currentIds.includes(id))
  const toRemove = data.projectAssignments.filter(
    (assignment) => assignment.project_id === project.id && !nextMemberIds.includes(assignment.user_id),
  )

  if (ctx.isRemote) {
    if (toRemove.length > 0) {
      const { error } = await supabase!.from('project_assignments').delete().in('id', toRemove.map((item) => item.id))
      if (error) throw error
    }
    if (toAdd.length > 0) {
      const { error } = await supabase!.from('project_assignments').insert(
        toAdd.map((memberId) => ({ project_id: project.id, user_id: memberId, notes: null })),
      )
      if (error) throw error
    }
  } else {
    setData((current) => ({
      ...current,
      projectAssignments: [
        ...current.projectAssignments.filter((assignment) => !toRemove.some((item) => item.id === assignment.id)),
        ...toAdd.map((memberId) => {
          const member = memberOptions.find((item) => item.id === memberId)
          return {
            id: makeId('project-assignment'),
            project_id: project.id,
            user_id: memberId,
            notes: null,
            created_at: new Date().toISOString(),
            profiles: member ? { name: member.name, email: member.email } : null,
            projects: {
              name: project.name,
              description: project.description,
              deadline: project.deadline,
              status: project.status,
            },
          } satisfies ProjectAssignment
        }),
      ],
    }))
  }

  await recordActivityLog(setData, {
    actor: profile,
    entityType: 'project_assignment',
    entityId: project.id,
    action: 'updated',
    summary: `${project.name} 프로젝트 배정을 ${nextMemberIds.length}명으로 조정했습니다.`,
    metadata: { assigned_user_ids: nextMemberIds },
  })
}

export async function deleteProject(ctx: RepositoryContext, project: Project): Promise<void> {
  const { profile, setData } = ctx

  if (ctx.isRemote) {
    const { error } = await supabase!.from('projects').delete().eq('id', project.id)
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      projects: current.projects.filter((item) => item.id !== project.id),
      projectAssignments: current.projectAssignments.filter((assignment) => assignment.project_id !== project.id),
    }))
  }

  await recordActivityLog(setData, {
    actor: profile,
    entityType: 'project',
    entityId: project.id,
    action: 'deleted',
    summary: `${project.name} 프로젝트를 삭제했습니다.`,
  })
}
