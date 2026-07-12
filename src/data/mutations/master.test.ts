import { describe, expect, it, vi } from 'vitest'
import type { AppData, Profile } from '../../types'
import type { RepositoryContext } from '../repositoryContext'
import { assignDuty, assignProduct, saveDutyAssignments, saveProductAssignments, toggleProfileActive } from './master'

vi.mock('../../lib/activityLog', () => ({
  recordActivityLog: vi.fn(async () => undefined),
}))

const leader: Profile = { id: 'leader-1', email: 'leader@example.com', name: 'Leader', role: 'leader', is_active: true }
const member: Profile = { id: 'member-1', email: 'member@example.com', name: 'Member', role: 'member', is_active: true }
const inactiveMember: Profile = { ...member, id: 'member-inactive', is_active: false }

function localContext(profile: Profile = leader): RepositoryContext {
  const data: AppData = {
    profiles: [leader, member, inactiveMember],
    allowedUsers: [],
    products: [{ id: 'product-1', name: 'Product', category: '자사', company_name: '자사', sort_order: 1 }],
    duties: [{ id: 'duty-1', name: 'Duty', major_category_id: 'category-1', sort_order: 1, duty_major_categories: null }],
    dutyMajorCategories: [{ id: 'category-1', name: 'Category', sort_order: 1 }],
    productAssignments: [],
    dutyAssignments: [],
    reviewRequests: [],
    projects: [],
    projectAssignments: [],
    profileNotes: [],
    activityLogs: [],
  }
  return { isRemote: false, profile, data, setData: vi.fn() }
}

describe('local assignment replacement parity', () => {
  it('rejects inactive leaders before mutating preview data', async () => {
    const ctx = localContext({ ...leader, is_active: false })

    await expect(saveProductAssignments(ctx, { productId: 'product-1', nextMemberIds: ['member-1'] }))
      .rejects.toThrow('활성 파트장 권한이 필요합니다.')
    expect(ctx.setData).not.toHaveBeenCalled()
  })

  it('rejects leaders who still require a password change', async () => {
    const ctx = localContext({ ...leader, must_change_password: true })

    await expect(saveDutyAssignments(ctx, { dutyId: 'duty-1', nextMemberIds: ['member-1'] }))
      .rejects.toThrow('활성 파트장 권한이 필요합니다.')
    expect(ctx.setData).not.toHaveBeenCalled()
  })

  it('rejects inactive or missing members in local product assignments', async () => {
    const inactiveCtx = localContext()
    await expect(saveProductAssignments(inactiveCtx, { productId: 'product-1', nextMemberIds: ['member-inactive'] }))
      .rejects.toThrow('활성 상태인 파트원에게만 배정할 수 있습니다.')

    const missingCtx = localContext()
    await expect(saveDutyAssignments(missingCtx, { dutyId: 'duty-1', nextMemberIds: ['missing-member'] }))
      .rejects.toThrow('이미 삭제되었거나 변경할 수 없는 항목입니다.')
    expect(inactiveCtx.setData).not.toHaveBeenCalled()
    expect(missingCtx.setData).not.toHaveBeenCalled()
  })

  it('allows an active leader to replace assignments for active members', async () => {
    const ctx = localContext()

    await saveProductAssignments(ctx, { productId: 'product-1', nextMemberIds: ['member-1'] })
    expect(ctx.setData).toHaveBeenCalled()
  })

  it('requires an active leader for single assignment mutations', async () => {
    const ctx = localContext(member)

    await expect(assignProduct(ctx, { productId: 'product-1', userId: 'member-1' })).rejects.toThrow(
      '활성 파트장 권한이 필요합니다.',
    )
    await expect(assignDuty(ctx, { dutyId: 'duty-1', userId: 'member-1' })).rejects.toThrow(
      '활성 파트장 권한이 필요합니다.',
    )
    expect(ctx.setData).not.toHaveBeenCalled()
  })

  it('does not allow local preview to deactivate the last active leader', async () => {
    const ctx = localContext()

    await expect(toggleProfileActive(ctx, leader.id, false)).rejects.toThrow('활성 파트장은 최소 한 명 이상 유지해야 합니다.')
    expect(ctx.setData).not.toHaveBeenCalled()
  })
})
