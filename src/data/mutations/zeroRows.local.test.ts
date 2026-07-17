import { describe, expect, it, vi } from 'vitest'
import type { AppData, Profile, Project } from '../../types'
import type { RepositoryContext } from '../repositoryContext'
import { UserFacingError } from '../../lib/errors'
import { assignProduct, deleteProduct, updateProduct } from './master'
import { deleteProject, updateProject } from './projects'

const leader: Profile = {
  id: 'leader-1',
  email: 'leader@example.com',
  name: 'Leader',
  role: 'leader',
}

const missingProject: Project = {
  id: 'missing-project',
  name: 'Missing',
  description: '',
  deadline: null,
  status: 'planned',
  created_by: leader.id,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
}

function localContext(): RepositoryContext {
  const data: AppData = {
    announcements: [],
    changeApplications: [],
    changeActionItems: [],
    productChangeTasks: [],
    changeProductScope: [],
    changeAssigneeOptions: [],
    profiles: [leader],
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
  return { isRemote: false, profile: leader, data, setData: vi.fn() }
}

describe('local missing-record mutation guards', () => {
  it('rejects missing product updates and deletes', async () => {
    await expect(updateProduct(localContext(), 'missing', { name: 'Updated' })).rejects.toBeInstanceOf(
      UserFacingError,
    )
    await expect(deleteProduct(localContext(), 'missing')).rejects.toBeInstanceOf(UserFacingError)
  })

  it('rejects missing project updates and deletes', async () => {
    await expect(
      updateProject(localContext(), missingProject.id, {
        name: 'Updated',
        description: '',
        deadline: null,
        status: 'planned',
      }),
    ).rejects.toBeInstanceOf(UserFacingError)
    await expect(deleteProject(localContext(), missingProject)).rejects.toBeInstanceOf(UserFacingError)
  })

  it('mirrors remote assignment invariants for missing and ineligible local targets', async () => {
    const missingProduct = localContext()
    missingProduct.data.profiles.push({
      id: 'member-1',
      email: 'member@example.com',
      name: 'Member',
      role: 'member',
    })
    await expect(
      assignProduct(missingProduct, { productId: 'missing', userId: 'member-1' }),
    ).rejects.toBeInstanceOf(UserFacingError)

    const inactiveMember = localContext()
    inactiveMember.data.products.push({
      id: 'product-1',
      name: 'Product',
      category: '자사',
      company_name: '자사',
    })
    inactiveMember.data.profiles.push({
      id: 'member-1',
      email: 'member@example.com',
      name: 'Member',
      role: 'member',
      is_active: false,
    })
    await expect(
      assignProduct(inactiveMember, { productId: 'product-1', userId: 'member-1' }),
    ).rejects.toBeInstanceOf(UserFacingError)
  })
})
