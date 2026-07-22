import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Profile } from '../../types'
import { createRepositoryContextFromDeps, type RepositoryContext } from '../repositoryContext'
import {
  addAllowedUser,
  addDuty,
  addDutyMajorCategory,
  addProduct,
  assignDuty,
  assignProduct,
  deleteAllowedUser,
  deleteDuty,
  deleteDutyMajorCategory,
  deleteProduct,
  importInvites,
  importProducts,
  saveDutyAssignments,
  saveProductAssignments,
  toggleProfileActive,
  updateDuty,
  updateDutyMajorCategory,
  updateInvite,
  updateProduct,
} from './master'

const activityLogMock = vi.hoisted(() => vi.fn(async (
  _setData: unknown,
  _input: unknown,
  _options?: unknown,
) => undefined))

vi.mock('../activityLog', () => ({
  recordActivityLog: activityLogMock,
}))

const revision = '2026-07-20T00:00:00.000Z'
const leader: Profile = { id: 'leader-1', email: 'leader@example.com', name: 'Leader', role: 'leader', is_active: true, updated_at: revision }
const member: Profile = { id: 'member-1', email: 'member@example.com', name: 'Member', role: 'member', is_active: true, updated_at: revision }
const previousMember: Profile = { id: 'member-2', email: 'previous@example.com', name: 'Previous', role: 'member', is_active: true, updated_at: revision }
const inactiveMember: Profile = { ...member, id: 'member-inactive', is_active: false }

function localContext(profile: Profile = leader): RepositoryContext {
  const data: AppData = {
    announcements: [],
    changeApplications: [],
    changeActionItems: [],
    productChangeTasks: [],
    changeProductScope: [],
    changeAssigneeOptions: [],
    profiles: [leader, member, previousMember, inactiveMember],
    allowedUsers: [],
    products: [{ id: 'product-1', name: 'Product', category: '자사', company_name: '자사', sort_order: 1, updated_at: revision }],
    duties: [{ id: 'duty-1', name: 'Duty', major_category_id: 'category-1', sort_order: 1, duty_major_categories: null, updated_at: revision }],
    dutyMajorCategories: [{ id: 'category-1', name: 'Category', sort_order: 1, updated_at: revision }],
    productAssignments: [],
    dutyAssignments: [],
    reviewRequests: [],
    projects: [],
    projectAssignments: [],
    profileNotes: [],
    activityLogs: [],
  }
  return createRepositoryContextFromDeps('local', {profile, data, setData: vi.fn() })
}

describe('local assignment replacement parity', () => {
  beforeEach(() => {
    activityLogMock.mockReset().mockResolvedValue(undefined)
  })

  it('rejects inactive leaders before mutating preview data', async () => {
    const ctx = localContext({ ...leader, is_active: false })

    await expect(saveProductAssignments(ctx, { productId: 'product-1', nextMemberIds: ['member-1'], reason: '배정 조정' }))
      .rejects.toThrow('활성 파트장 권한이 필요합니다.')
    expect(ctx.setData).not.toHaveBeenCalled()
  })

  it('rejects leaders who still require a password change', async () => {
    const ctx = localContext({ ...leader, must_change_password: true })

    await expect(saveDutyAssignments(ctx, { dutyId: 'duty-1', nextMemberIds: ['member-1'], reason: '배정 조정' }))
      .rejects.toThrow('활성 파트장 권한이 필요합니다.')
    expect(ctx.setData).not.toHaveBeenCalled()
  })

  it('rejects inactive or missing members in local product assignments', async () => {
    const inactiveCtx = localContext()
    await expect(saveProductAssignments(inactiveCtx, { productId: 'product-1', nextMemberIds: ['member-inactive'], reason: '배정 조정' }))
      .rejects.toThrow('활성 상태인 파트원에게만 배정할 수 있습니다.')

    const missingCtx = localContext()
    await expect(saveDutyAssignments(missingCtx, { dutyId: 'duty-1', nextMemberIds: ['missing-member'], reason: '배정 조정' }))
      .rejects.toThrow('이미 삭제되었거나 변경할 수 없는 항목입니다.')
    expect(inactiveCtx.setData).not.toHaveBeenCalled()
    expect(missingCtx.setData).not.toHaveBeenCalled()
  })

  it('allows an active leader to replace assignments for active members', async () => {
    const ctx = localContext()

    await saveProductAssignments(ctx, { productId: 'product-1', nextMemberIds: ['member-1'], reason: '배정 조정' })
    expect(ctx.setData).toHaveBeenCalled()
  })

  it('stores an unassigned reason locally and clears it when a member is assigned', async () => {
    const ctx = localContext()
    let nextData = ctx.data
    ctx.setData = (updater) => {
      nextData = typeof updater === 'function' ? updater(nextData) : updater
    }

    await saveProductAssignments(ctx, {
      productId: 'product-1',
      nextMemberIds: [],
      unassignedReason: '담당 제품군 조정 중',
      reason: '배정 조정',
    })
    expect(nextData.products[0]?.unassigned_reason).toBe('담당 제품군 조정 중')

    ctx.data = nextData
    await assignProduct(ctx, { productId: 'product-1', userId: 'member-1' })
    expect(nextData.products[0]?.unassigned_reason).toBeNull()
    expect(nextData.productAssignments).toHaveLength(1)
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

  it('keeps every local-only leader guard on the repository method that needs it', async () => {
    const ctx = localContext(member)
    const guardedOperations = [
      () => importProducts(ctx, []),
      () => importInvites(ctx, []),
      () => addAllowedUser(ctx, { email: 'new@example.com', name: 'New', role: 'member' }),
      () => addProduct(ctx, { name: 'New product' }),
      () => addDutyMajorCategory(ctx, { name: 'New category' }),
      () => addDuty(ctx, { majorCategoryId: 'category-1', name: 'New duty' }),
      () => saveProductAssignments(ctx, { productId: 'product-1', nextMemberIds: [], reason: '배정 조정' }),
      () => saveDutyAssignments(ctx, { dutyId: 'duty-1', nextMemberIds: [], reason: '배정 조정' }),
      () => assignProduct(ctx, { productId: 'product-1', userId: 'member-1' }),
      () => assignDuty(ctx, { dutyId: 'duty-1', userId: 'member-1' }),
      () => updateDuty(ctx, 'duty-1', {
        name: 'Changed duty',
        major_category_id: 'category-1',
        expectedUpdatedAt: null,
        reason: 'test reason',
      }),
      () => updateInvite(ctx, 'invite-1', {
        email: 'new@example.com',
        name: 'New',
        role: 'member',
        expectedUpdatedAt: null,
        reason: 'test reason',
      }),
      () => toggleProfileActive(ctx, 'member-1', false, { expectedUpdatedAt: null, reason: 'test reason' }),
      () => deleteAllowedUser(ctx, 'invite-1', { expectedUpdatedAt: null, reason: 'test reason' }),
      () => deleteProduct(ctx, 'product-1', { expectedUpdatedAt: null, reason: 'test reason' }),
      () => deleteDuty(ctx, 'duty-1', { expectedUpdatedAt: null, reason: 'test reason' }),
      () => deleteDutyMajorCategory(ctx, 'category-1', { expectedUpdatedAt: null, reason: 'test reason' }),
    ]

    for (const operation of guardedOperations) {
      await expect(operation()).rejects.toThrow('활성 파트장 권한이 필요합니다.')
    }
    expect(ctx.setData).not.toHaveBeenCalled()
    expect(activityLogMock).not.toHaveBeenCalled()
  })

  it('keeps product and duty-category update authorization aligned with remote mode', async () => {
    const productCtx = localContext(member)
    await expect(updateProduct(productCtx, 'product-1', {
      name: 'Member-side product update',
      expectedUpdatedAt: revision,
      reason: 'test reason',
    })).rejects.toThrow('활성 파트장 권한이 필요합니다.')
    expect(productCtx.setData).not.toHaveBeenCalled()

    activityLogMock.mockClear()
    const categoryCtx = localContext(member)
    await expect(updateDutyMajorCategory(categoryCtx, 'category-1', {
      name: 'Member-side category update',
      expectedUpdatedAt: revision,
      reason: 'test reason',
    })).rejects.toThrow('활성 파트장 권한이 필요합니다.')
    expect(categoryCtx.setData).not.toHaveBeenCalled()
    expect(activityLogMock).not.toHaveBeenCalled()
  })

  it('reconciles an invite role with its pre-edit-email profile in one local operation', async () => {
    const ctx = localContext()
    ctx.data.allowedUsers = [{
      id: 'invite-1', email: member.email, name: member.name, role: 'member', updated_at: revision,
    }]
    let nextData = ctx.data
    ctx.setData = (updater) => {
      nextData = typeof updater === 'function' ? updater(nextData) : updater
    }

    await updateInvite(ctx, 'invite-1', {
      email: 'new-member@example.com',
      name: 'Renamed invite',
      role: 'leader',
      expectedUpdatedAt: revision,
      reason: 'role and email correction',
    })

    expect(nextData.allowedUsers.find((item) => item.id === 'invite-1')).toMatchObject({
      email: 'new-member@example.com',
      role: 'leader',
    })
    expect(nextData.profiles.find((item) => item.id === member.id)).toMatchObject({
      name: member.name,
      role: 'leader',
    })
  })

  it('keeps local assignment no-op silent and logs only after changed state is applied', async () => {
    const trace: string[] = []
    activityLogMock.mockImplementation(async () => {
      trace.push('activity')
    })
    const ctx = localContext()
    ctx.data.productAssignments = [{
      id: 'assignment-1',
      product_id: 'product-1',
      user_id: 'member-1',
      products: null,
      profiles: null,
    }]
    ctx.setData = vi.fn(() => {
      trace.push('state')
    })

    await assignProduct(ctx, { productId: 'product-1', userId: 'member-1' })
    expect(trace).toEqual([])
    expect(ctx.setData).not.toHaveBeenCalled()
    expect(activityLogMock).not.toHaveBeenCalled()

    ctx.data.productAssignments = []
    await assignProduct(ctx, { productId: 'product-1', userId: 'member-1' })
    expect(trace).toEqual(['state', 'activity'])
    expect(activityLogMock.mock.calls[0][1]).toMatchObject({
      metadata: { user_id: 'member-1', transferred_task_count: 0 },
    })
  })

  it('keeps opted-in transfer silent when both the assignment and transfer set are unchanged', async () => {
    const ctx = localContext()
    ctx.data.productAssignments = [{
      id: 'assignment-1', product_id: 'product-1', user_id: 'member-1', products: null, profiles: null,
    }]

    await assignProduct(ctx, {
      productId: 'product-1',
      userId: 'member-1',
      transferPendingChangeTasks: true,
      transferReason: '담당자 확인',
    })

    expect(ctx.setData).not.toHaveBeenCalled()
    expect(activityLogMock).not.toHaveBeenCalled()
  })

  it('bumps the local product revision when a new assignment is inserted', async () => {
    const ctx = localContext()
    ctx.data.products[0]!.updated_at = '2026-01-01T00:00:00.000Z'
    let nextData = ctx.data
    ctx.setData = (updater) => {
      nextData = typeof updater === 'function' ? updater(nextData) : updater
    }

    await assignProduct(ctx, { productId: 'product-1', userId: 'member-1' })

    expect(nextData.products[0]?.updated_at).not.toBe('2026-01-01T00:00:00.000Z')
  })

  it('atomically mirrors opted-in pending change-task transfer in preview data', async () => {
    const ctx = localContext()
    ctx.data.changeApplications = [{
      id: 'change-1',
      change_number: 'CC-LOCAL-TRANSFER',
      source: 'official',
      title: 'Transfer fixture',
      summary: 'Transfer fixture',
      source_url: null,
      effective_date: '2026-08-01',
      status: 'published',
      created_by: leader.id,
      published_at: '2026-07-01T00:00:00.000Z',
      cancelled_at: null,
      cancellation_reason: null,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    }]
    ctx.data.changeActionItems = [{
      id: 'action-1',
      change_application_id: 'change-1',
      kind: 'product_standard',
      custom_kind_name: null,
      content: 'Apply it',
      due_date: '2026-08-01',
      sort_order: 1,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    }]
    ctx.data.productChangeTasks = [{
      id: 'task-1',
      action_item_id: 'action-1',
      product_id: 'product-1',
      product_name: 'Product',
      assignee_id: previousMember.id,
      assignee_name: previousMember.name,
      status: 'pending',
      product_note: null,
      completion_note: null,
      resolution_reason: null,
      proxy_reason: null,
      completed_by: null,
      completed_by_name: null,
      completed_at: null,
      reopened_by: null,
      reopened_by_name: null,
      reopened_at: null,
      reopen_reason: null,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    }]
    let nextData = ctx.data
    ctx.setData = (updater) => {
      nextData = typeof updater === 'function' ? updater(nextData) : updater
    }

    await assignProduct(ctx, {
      productId: 'product-1',
      userId: member.id,
      transferPendingChangeTasks: true,
      transferReason: '제품 담당자 변경에 따른 이관',
    })

    expect(nextData.productAssignments.some(
      (assignment) => assignment.product_id === 'product-1' && assignment.user_id === member.id,
    )).toBe(true)
    expect(nextData.productChangeTasks[0]).toMatchObject({
      status: 'pending',
      assignee_id: member.id,
      assignee_name: member.name,
    })
    expect(activityLogMock).toHaveBeenCalledTimes(2)
    expect(activityLogMock.mock.calls[0][1]).toMatchObject({
      entityType: 'product_assignment',
      action: 'created',
      metadata: { transferred_task_count: 1 },
    })
    expect(activityLogMock.mock.calls[1][1]).toMatchObject({
      entityType: 'product_change_task',
      entityId: 'task-1',
      action: 'reassigned',
      metadata: {
        from_assignee_id: previousMember.id,
        to_assignee_id: member.id,
        reason: '제품 담당자 변경에 따른 이관',
      },
    })
  })

  it('does not allow local preview to deactivate the last active leader', async () => {
    const ctx = localContext()

    await expect(
      toggleProfileActive(ctx, leader.id, false, { expectedUpdatedAt: revision, reason: 'test reason' }),
    ).rejects.toThrow('활성 파트장은 최소 한 명 이상 유지해야 합니다.')
    expect(ctx.setData).not.toHaveBeenCalled()
  })
})
