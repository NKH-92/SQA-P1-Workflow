import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Profile, Project } from '../../types'
import type { RepositoryContext } from '../repositoryContext'
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
  }
})

mocks.from.mockImplementation(() => ({ update: mocks.update, delete: mocks.delete }))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { from: mocks.from },
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
    profiles: [leader],
    allowedUsers: [],
    products: [{ id: 'product-1', name: 'Product', category: '자사', company_name: '자사' }],
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

describe('remote zero-row mutation guards', () => {
  beforeEach(() => {
    mocks.select.mockClear()
    mocks.eq.mockClear()
    mocks.update.mockClear()
    mocks.delete.mockClear()
    mocks.from.mockClear()
  })

  it('rejects a product update hidden or removed by the server', async () => {
    await expect(
      updateProduct(remoteContext(), 'product-1', { name: 'Updated' }),
    ).rejects.toBeInstanceOf(UserFacingError)
    expect(mocks.select).toHaveBeenCalledWith('id')
  })

  it('rejects a product delete hidden or removed by the server', async () => {
    await expect(deleteProduct(remoteContext(), 'product-1')).rejects.toBeInstanceOf(UserFacingError)
    expect(mocks.select).toHaveBeenCalledWith('id')
  })

  it('rejects a project update hidden or removed by the server', async () => {
    await expect(
      updateProject(remoteContext(), project.id, {
        name: 'Updated',
        description: project.description,
        deadline: project.deadline,
        status: project.status,
      }),
    ).rejects.toBeInstanceOf(UserFacingError)
    expect(mocks.select).toHaveBeenCalledWith('id')
    expect(mocks.eq).toHaveBeenCalledWith('updated_at', project.updated_at)
  })

  it('rejects a project delete hidden or removed by the server', async () => {
    await expect(deleteProject(remoteContext(), project)).rejects.toBeInstanceOf(UserFacingError)
    expect(mocks.select).toHaveBeenCalledWith('id')
  })
})
