import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Profile, Project } from '../../types'
import { createRepositoryContextFromDeps, type RepositoryContext } from '../repositoryContext'
import { UserFacingError } from '../../lib/errors'

const mocks = vi.hoisted(() => {
  const query = { select: vi.fn(async () => ({ data: [], error: null })) } as {
    select: ReturnType<typeof vi.fn>
    eq?: ReturnType<typeof vi.fn>
  }
  const eq = vi.fn(() => query)
  query.eq = eq
  return {
    select: query.select,
    eq,
    update: vi.fn(() => ({ eq })),
    delete: vi.fn(() => ({ eq })),
    from: vi.fn(),
    // updateProduct calls update_product_if_current instead of a
    // bare table update; "hidden or removed by the server" becomes a
    // `master record not found` RPC error rather than a 0-row PostgREST result.
    rpc: vi.fn(async () => ({ data: null, error: { message: 'master record not found' } })),
  }
})

mocks.from.mockImplementation(() => ({ update: mocks.update, delete: mocks.delete }))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { from: mocks.from, rpc: mocks.rpc },
}))

import { deleteProduct, updateProduct } from './master'
import { deleteProject, updateProject } from './projects'

const leader: Profile = {
  id: 'leader-1',
  email: 'leader@example.com',
  name: 'Leader',
  role: 'leader',
}

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
    changeApplications: [],
    changeActionItems: [],
    productChangeTasks: [],
    changeProductScope: [],
    changeAssigneeOptions: [],
    profiles: [leader],
    allowedUsers: [],
    products: [{ id: 'product-1', name: 'Product', category: '자사', company_name: '자사', updated_at: '2026-07-01T00:00:00.000Z' }],
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
  return createRepositoryContextFromDeps('remote', {profile: leader, data, setData: vi.fn() })
}

describe('remote zero-row mutation guards', () => {
  beforeEach(() => {
    mocks.select.mockClear()
    mocks.eq.mockClear()
    mocks.update.mockClear()
    mocks.delete.mockClear()
    mocks.from.mockClear()
    mocks.rpc.mockClear().mockImplementation(async () => ({ data: null, error: { message: 'master record not found' } }))
  })

  it('rejects a product update hidden or removed by the server', async () => {
    await expect(
      updateProduct(remoteContext(), 'product-1', {
        name: 'Updated',
        expectedUpdatedAt: '2026-07-01T00:00:00.000Z',
        reason: 'test reason',
      }),
    ).rejects.toBeInstanceOf(UserFacingError)
    expect(mocks.rpc).toHaveBeenCalledWith('update_product_if_current', expect.objectContaining({
      p_product_id: 'product-1',
    }))
  })

  it('rejects a product delete hidden or removed by the server', async () => {
    await expect(deleteProduct(remoteContext(), 'product-1', {
      expectedUpdatedAt: '2026-07-01T00:00:00.000Z',
      reason: 'duplicate cleanup',
    })).rejects.toBeInstanceOf(UserFacingError)
    expect(mocks.rpc).toHaveBeenCalledWith('delete_product_if_current', expect.objectContaining({
      p_id: 'product-1',
      p_expected_updated_at: '2026-07-01T00:00:00.000Z',
      p_reason: 'duplicate cleanup',
    }))
  })

  it('rejects a project update hidden or removed by the server', async () => {
    await expect(
      updateProject(remoteContext(), project.id, {
        name: 'Updated',
        description: project.description,
        deadline: project.deadline,
        status: project.status,
      }, project.updated_at ?? null),
    ).rejects.toBeInstanceOf(UserFacingError)
    expect(mocks.select).toHaveBeenCalledWith('id')
    expect(mocks.eq).toHaveBeenCalledWith('updated_at', project.updated_at)
  })

  it('rejects a project delete hidden or removed by the server', async () => {
    await expect(deleteProject(remoteContext(), project, {
      expectedUpdatedAt: project.updated_at ?? null,
      reason: 'project cleanup',
    })).rejects.toBeInstanceOf(UserFacingError)
    expect(mocks.rpc).toHaveBeenCalledWith('delete_project_if_current', expect.objectContaining({
      p_id: project.id,
      p_expected_updated_at: project.updated_at,
      p_reason: 'project cleanup',
    }))
  })
})
