import { describe, expect, it, vi } from 'vitest'
import type { AppData, Profile } from '../../types'
import type { RepositoryContext } from '../repositoryContext'
import { assignDuty, assignProduct, saveDutyAssignments, saveProductAssignments, toggleProfileActive } from './master'

vi.mock('../../lib/activityLog', () => ({
  recordActivityLog: vi.fn(async () => undefined),
}))

const leader: Profile = { id: 'leader-1', email: 'leader@example.com', name: 'Leader', role: 'leader', is_active: true }
const member: Profile = { id: 'member-1', email: 'member@example.com', name: 'Member', role: 'member', is_active: true }
const previousMember: Profile = { id: 'member-2', email: 'previous@example.com', name: 'Previous', role: 'member', is_active: true }
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
  })

  it('does not allow local preview to deactivate the last active leader', async () => {
    const ctx = localContext()

    await expect(toggleProfileActive(ctx, leader.id, false)).rejects.toThrow('활성 파트장은 최소 한 명 이상 유지해야 합니다.')
    expect(ctx.setData).not.toHaveBeenCalled()
  })
})
