import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Profile, Project } from '../../types'
import type { RepositoryContext } from '../repositoryContext'
import { UserFacingError } from '../../lib/errors'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(async (): Promise<{ data: unknown; error: { message: string } | null }> => ({ data: null, error: null })),
  recordActivityLog: vi.fn(async () => undefined),
}))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { rpc: mocks.rpc },
}))
vi.mock('../../lib/activityLog', () => ({ recordActivityLog: mocks.recordActivityLog }))

import { saveProjectAssignments } from './projects'

const leader: Profile = { id: 'leader-1', email: 'leader@example.com', name: 'Leader', role: 'leader' }
const project: Project = {
  id: 'project-1',
  name: 'Project',
  description: 'Description',
  deadline: null,
  status: 'planned',
  created_by: leader.id,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
}

function remoteContext(): RepositoryContext {
  const data: AppData = {
    announcements: [],
    profiles: [leader],
    allowedUsers: [],
    products: [],
    duties: [],
    dutyMajorCategories: [],
    productAssignments: [],
    dutyAssignments: [],
    reviewRequests: [],
    projects: [project],
    projectAssignments: [],
    profileNotes: [],
    activityLogs: [],
  }
  return { isRemote: true, profile: leader, data, setData: vi.fn() }
}

describe('project assignment mutation contract (remote)', () => {
  beforeEach(() => {
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null })
    mocks.recordActivityLog.mockClear()
  })

  it('uses the revision-checked replacement RPC and snapshot timestamp', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: '2026-07-11T01:00:00.000Z', error: null })
    const ctx = remoteContext()
    await saveProjectAssignments(ctx, {
      project,
      nextMemberIds: ['member-1'],
      memberOptions: [],
    })

    expect(mocks.rpc).toHaveBeenCalledWith('replace_project_assignments_if_current', {
      p_project_id: project.id,
      p_member_ids: ['member-1'],
      p_expected_updated_at: project.updated_at,
    })
    expect(mocks.recordActivityLog).toHaveBeenCalledOnce()
    expect(ctx.setData).toHaveBeenCalled()
  })

  it('surfaces a stale project conflict without recording success', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'project changed since it was opened' } })

    await expect(saveProjectAssignments(remoteContext(), {
      project,
      nextMemberIds: [],
      memberOptions: [],
    })).rejects.toBeInstanceOf(UserFacingError)
    expect(mocks.recordActivityLog).not.toHaveBeenCalled()
  })

  it('rejects a legacy project row without an updated_at snapshot', async () => {
    const legacyProject = { ...project, updated_at: undefined }
    await expect(saveProjectAssignments(remoteContext(), {
      project: legacyProject,
      nextMemberIds: [],
      memberOptions: [],
    })).rejects.toBeInstanceOf(UserFacingError)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
