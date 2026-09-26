import { describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../../demoData'
import { PERMISSION_MESSAGE } from '../../lib/errors'
import { PROJECT_ASSIGNEE_MESSAGE } from '../local/localProjectRepository'
import { createRepositoryContextFromDeps, type RepositoryContext } from '../repositoryContext'
import { createProject, saveProjectAssignments } from './projects'

function context(profile: typeof previewLeader): RepositoryContext {
  const data = createPreviewData()
  return createRepositoryContextFromDeps('local', {profile, data, setData: vi.fn() })
}

describe('local project permission parity', () => {
  it('requires an active leader for project creation and assignment replacement', async () => {
    const memberContext = context(previewMember)
    await expect(
      createProject(memberContext, {
        project: { name: 'Blocked', description: 'x', deadline: null, status: 'planned' },
        memberIds: [],
        memberOptions: [],
      }),
    ).rejects.toThrow(PERMISSION_MESSAGE)

    const leaderContext = context(previewLeader)
    const project = leaderContext.data.projects[0]!
    const inactive = { ...previewMember, id: 'inactive-member', is_active: false }
    leaderContext.data = { ...leaderContext.data, profiles: [...leaderContext.data.profiles, inactive] }
    await expect(
      saveProjectAssignments(leaderContext, {
        project,
        nextMemberIds: [inactive.id],
        memberOptions: [inactive],
      }),
    ).rejects.toThrow(PROJECT_ASSIGNEE_MESSAGE)
  })

  it('allows the current active leader to assign a project to themselves', async () => {
    const leaderContext = context(previewLeader)
    leaderContext.data = {
      ...leaderContext.data,
      profiles: [previewLeader, ...leaderContext.data.profiles],
    }
    const project = leaderContext.data.projects[0]!

    await expect(
      saveProjectAssignments(leaderContext, {
        project,
        nextMemberIds: [previewLeader.id],
        memberOptions: [previewLeader],
      }),
    ).resolves.toBeUndefined()
    expect(leaderContext.setData).toHaveBeenCalled()
  })
})
