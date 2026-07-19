import { describe, expect, it } from 'vitest'
import { createProject, saveProjectAssignments } from './projects'
import { createRepositoryContextFromDeps, type RepositoryContext } from '../repositoryContext'
import type { AppData, Profile, Project } from '../../types'

describe('createProject (demo)', () => {
  it('creates a project and assignments in local state', async () => {
    const leader: Profile = {
      id: 'leader-1',
      email: 'leader@example.com',
      name: 'Leader',
      role: 'leader',
    }
    const member: Profile = {
      id: 'member-1',
      email: 'member@example.com',
      name: 'Member',
      role: 'member',
    }
    const data: AppData = {
    announcements: [],
    changeApplications: [],
    changeActionItems: [],
    productChangeTasks: [],
    changeProductScope: [],
    changeAssigneeOptions: [],
      profiles: [leader, member],
      allowedUsers: [],
      products: [],
      duties: [],
      dutyMajorCategories: [],
      productAssignments: [],
      dutyAssignments: [],
      reviewRequests: [],
      projects: [],
      projectAssignments: [],
      profileNotes: [],
      activityLogs: [],
    }

    let nextData = data
    const setData: RepositoryContext['setData'] = (updater) => {
      nextData = typeof updater === 'function' ? updater(nextData) : updater
    }

    const projectId = await createProject(
      createRepositoryContextFromDeps('local', {profile: leader, data, setData }),
      {
        project: {
          name: 'Demo Project',
          description: 'desc',
          deadline: '2026-08-01',
          status: 'planned',
        },
        memberIds: [member.id],
        memberOptions: [member],
      },
    )

    expect(projectId).toBeTruthy()
    expect(nextData.projects).toHaveLength(1)
    expect(nextData.projects[0]?.name).toBe('Demo Project')
    expect(nextData.projectAssignments).toHaveLength(1)
    expect(nextData.projectAssignments[0]?.user_id).toBe(member.id)
    expect(nextData.activityLogs[0]?.action).toBe('created')
  })
})

describe('saveProjectAssignments (demo)', () => {
  it('replaces project member assignments in local state', async () => {
    const leader: Profile = {
      id: 'leader-1',
      email: 'leader@example.com',
      name: 'Leader',
      role: 'leader',
    }
    const memberA: Profile = {
      id: 'member-a',
      email: 'a@example.com',
      name: 'Member A',
      role: 'member',
    }
    const memberB: Profile = {
      id: 'member-b',
      email: 'b@example.com',
      name: 'Member B',
      role: 'member',
    }
    const project: Project = {
      id: 'project-1',
      name: 'Test Project',
      description: 'desc',
      deadline: null,
      status: 'planned',
      created_by: leader.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const data: AppData = {
      announcements: [],
      changeApplications: [],
      changeActionItems: [],
      productChangeTasks: [],
      changeProductScope: [],
      changeAssigneeOptions: [],
      profiles: [leader, memberA, memberB],
      allowedUsers: [],
      products: [],
      duties: [],
      dutyMajorCategories: [],
      productAssignments: [],
      dutyAssignments: [],
      reviewRequests: [],
      projects: [project],
      projectAssignments: [
        {
          id: 'assignment-a',
          project_id: project.id,
          user_id: memberA.id,
          notes: null,
          created_at: new Date().toISOString(),
          profiles: { name: memberA.name, email: memberA.email },
          projects: {
            name: project.name,
            description: project.description,
            deadline: project.deadline,
            status: project.status,
          },
        },
      ],
      profileNotes: [],
      activityLogs: [],
    }

    let nextData = data
    const setData: RepositoryContext['setData'] = (updater) => {
      nextData = typeof updater === 'function' ? updater(nextData) : updater
    }

    await saveProjectAssignments(
      createRepositoryContextFromDeps('local', {profile: leader, data, setData }),
      {
        project,
        nextMemberIds: [memberB.id],
        memberOptions: [memberA, memberB],
      },
    )

    const assigned = nextData.projectAssignments.filter((item) => item.project_id === project.id)
    expect(assigned).toHaveLength(1)
    expect(assigned[0]?.user_id).toBe(memberB.id)
    expect(nextData.activityLogs[0]?.action).toBe('updated')
  })
})
