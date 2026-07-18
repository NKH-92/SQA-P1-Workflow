import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Profile } from '../../types'
import { createRepositoryContextFromDeps, type RepositoryContext } from '../repositoryContext'

const { activityLogMock, rpcMock, fromMock, trace } = vi.hoisted(() => {
  const callTrace: string[] = []
  return {
    activityLogMock: vi.fn(async (
      _setData: unknown,
      _input: unknown,
      _options?: unknown,
    ) => {
      callTrace.push('activity')
    }),
    rpcMock: vi.fn(async () => {
      callTrace.push('supabase')
      return { error: null as { message: string } | null }
    }),
    fromMock: vi.fn(() => ({ insert: vi.fn(async () => ({ error: null })) })),
    trace: callTrace,
  }
})

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { rpc: rpcMock, from: fromMock },
}))
vi.mock('../../lib/activityLog', () => ({
  recordActivityLog: activityLogMock,
}))

import { addProduct, assignDuty, assignProduct, saveProductAssignments } from './master'

const leader: Profile = {
  id: 'leader-1',
  email: 'leader@example.com',
  name: 'Leader',
  role: 'leader',
}

function remoteContext(profile: Profile = leader): RepositoryContext {
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
  return createRepositoryContextFromDeps('remote', {profile, data, setData: vi.fn() })
}

describe('single assignment RPC contracts (remote)', () => {
  beforeEach(() => {
    trace.length = 0
    activityLogMock.mockReset().mockImplementation(async () => {
      trace.push('activity')
    })
    rpcMock.mockReset().mockImplementation(async () => {
      trace.push('supabase')
      return { error: null }
    })
    fromMock.mockReset().mockImplementation(() => ({ insert: vi.fn(async () => ({ error: null })) }))
  })

  it('adds a product assignment without replacing the server-side assignment list', async () => {
    await assignProduct(remoteContext(), { productId: 'product-1', userId: 'member-1' })

    expect(rpcMock).toHaveBeenCalledWith('add_product_assignment', {
      p_product_id: 'product-1',
      p_user_id: 'member-1',
    })
    expect(rpcMock).not.toHaveBeenCalledWith('replace_product_assignments', expect.anything())
    expect(activityLogMock).toHaveBeenCalledOnce()
    expect(activityLogMock.mock.calls[0][1]).toMatchObject({
      metadata: { user_id: 'member-1' },
    })
    expect((activityLogMock.mock.calls[0][1] as { metadata: Record<string, unknown> }).metadata)
      .toEqual({ user_id: 'member-1' })
  })

  it('adds a duty assignment without replacing the server-side assignment list', async () => {
    await assignDuty(remoteContext(), { dutyId: 'duty-1', userId: 'member-1' })

    expect(rpcMock).toHaveBeenCalledWith('add_duty_assignment', {
      p_duty_id: 'duty-1',
      p_user_id: 'member-1',
    })
    expect(rpcMock).not.toHaveBeenCalledWith('replace_duty_assignments', expect.anything())
    expect(activityLogMock).toHaveBeenCalledOnce()
  })

  it('uses the atomic product-assignment transfer RPC when the leader opts in', async () => {
    await assignProduct(remoteContext(), {
      productId: 'product-1',
      userId: 'member-2',
      transferPendingChangeTasks: true,
      transferReason: '제품 담당자 변경에 따른 이관',
    })

    expect(rpcMock).toHaveBeenCalledWith('assign_product_and_transfer_change_tasks', {
      p_product_id: 'product-1',
      p_user_id: 'member-2',
      p_transfer_pending: true,
      p_reason: '제품 담당자 변경에 따른 이관',
    })
    expect(rpcMock).not.toHaveBeenCalledWith('add_product_assignment', expect.anything())
    expect(activityLogMock).not.toHaveBeenCalled()
  })

  it('does not trust a stale local duplicate when adding remotely', async () => {
    const ctx = remoteContext()
    ctx.data.productAssignments = [{
      id: 'stale-assignment',
      product_id: 'product-1',
      user_id: 'member-1',
      products: null,
      profiles: null,
    }]

    await assignProduct(ctx, { productId: 'product-1', userId: 'member-1' })

    expect(rpcMock).toHaveBeenCalledOnce()
  })

  it('saves the unassigned state and reason through the atomic RPC', async () => {
    await saveProductAssignments(remoteContext(), {
      productId: 'product-1',
      nextMemberIds: [],
      unassignedReason: '  담당자 협의 중  ',
    })

    expect(rpcMock).toHaveBeenCalledWith('replace_product_assignments_with_reason', {
      p_product_id: 'product-1',
      p_member_ids: [],
      p_unassigned_reason: '담당자 협의 중',
    })
  })

  it('checks the Supabase result before writing the client activity log', async () => {
    await assignDuty(remoteContext(), { dutyId: 'duty-1', userId: 'member-1' })
    expect(trace).toEqual(['supabase', 'activity'])

    trace.length = 0
    activityLogMock.mockClear()
    rpcMock.mockImplementationOnce(async () => {
      trace.push('supabase')
      return { error: { message: 'assignment failed' } }
    })
    await expect(assignDuty(remoteContext(), { dutyId: 'duty-1', userId: 'member-1' }))
      .rejects.toMatchObject({ message: 'assignment failed' })
    expect(trace).toEqual(['supabase'])
    expect(activityLogMock).not.toHaveBeenCalled()
  })

  it('does not apply local leader guards to remote persistence calls', async () => {
    const inactiveMember: Profile = {
      id: 'member-inactive',
      email: 'inactive@example.com',
      name: 'Inactive',
      role: 'member',
      is_active: false,
      must_change_password: true,
    }

    await addProduct(remoteContext(inactiveMember), { name: 'Remote guarded by RLS' })

    expect(fromMock).toHaveBeenCalledWith('products')
    expect(activityLogMock).toHaveBeenCalledOnce()
  })
})
