import { describe, expect, it } from 'vitest'
import { createProject } from './projects'
import type { RepositoryContext } from '../repositoryContext'
import type { AppData, Profile } from '../../types'

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
      { isRemote: false, profile: leader, data, setData },
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
