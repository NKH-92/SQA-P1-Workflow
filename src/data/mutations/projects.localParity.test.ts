import { describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../../demoData'
import type { RepositoryContext } from '../repositoryContext'
import { createProject, saveProjectAssignments } from './projects'

function context(profile: typeof previewLeader): RepositoryContext {
  const data = createPreviewData()
  return { isRemote: false, profile, data, setData: vi.fn() }
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
    ).rejects.toThrow('활성 파트장 권한이 필요합니다.')

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
    ).rejects.toThrow('활성 파트원 또는 현재 파트장 본인에게만 프로젝트를 배정할 수 있습니다.')
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
