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
      return { data: true as boolean | string | null, error: null as { message: string } | null }
    }),
    fromMock: vi.fn(() => ({ insert: vi.fn(async () => ({ error: null })) })),
    trace: callTrace,
  }
})

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { rpc: rpcMock, from: fromMock },
}))
vi.mock('../activityLog', () => ({
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
      return { data: true, error: null }
    })
    fromMock.mockReset().mockImplementation(() => ({ insert: vi.fn(async () => ({ error: null })) }))
  })

  it('adds a product assignment without replacing the server-side assignment list', async () => {
    const result = await assignProduct(remoteContext(), { productId: 'product-1', userId: 'member-1' })

    expect(rpcMock).toHaveBeenCalledWith('try_add_product_assignment', {
      p_product_id: 'product-1',
      p_user_id: 'member-1',
    })
    expect(rpcMock).not.toHaveBeenCalledWith('add_product_assignment', expect.anything())
    expect(rpcMock).not.toHaveBeenCalledWith('replace_product_assignments', expect.anything())
    expect(result).toEqual({ noop: false })
    expect(activityLogMock).toHaveBeenCalledOnce()
    expect(activityLogMock.mock.calls[0][1]).toMatchObject({
      metadata: { user_id: 'member-1' },
    })
    expect((activityLogMock.mock.calls[0][1] as { metadata: Record<string, unknown> }).metadata)
      .toEqual({ user_id: 'member-1' })
  })

  it('adds a duty assignment without replacing the server-side assignment list', async () => {
    const result = await assignDuty(remoteContext(), { dutyId: 'duty-1', userId: 'member-1' })

    expect(rpcMock).toHaveBeenCalledWith('try_add_duty_assignment', {
      p_duty_id: 'duty-1',
      p_user_id: 'member-1',
    })
    expect(rpcMock).not.toHaveBeenCalledWith('add_duty_assignment', expect.anything())
    expect(rpcMock).not.toHaveBeenCalledWith('replace_duty_assignments', expect.anything())
    expect(result).toEqual({ noop: false })
    expect(activityLogMock).toHaveBeenCalledOnce()
  })

  it('reports a no-op and skips the client activity log when the RPC reports the row already existed', async () => {
    rpcMock.mockImplementationOnce(async () => {
      trace.push('supabase')
      return { data: false, error: null }
    })
    const productResult = await assignProduct(remoteContext(), { productId: 'product-1', userId: 'member-1' })
    expect(productResult).toEqual({ noop: true })
    expect(activityLogMock).not.toHaveBeenCalled()

    trace.length = 0
    rpcMock.mockImplementationOnce(async () => {
      trace.push('supabase')
      return { data: false, error: null }
    })
    const dutyResult = await assignDuty(remoteContext(), { dutyId: 'duty-1', userId: 'member-1' })
    expect(dutyResult).toEqual({ noop: true })
    expect(activityLogMock).not.toHaveBeenCalled()
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
    expect(rpcMock).not.toHaveBeenCalledWith('try_add_product_assignment', expect.anything())
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

  it('saves the unassigned state and reason through the OCC-guarded atomic RPC', async () => {
    const ctx = remoteContext()
    ctx.data.products = [{ id: 'product-1', name: 'Product', updated_at: '2026-07-01T00:00:00.000Z' }]

    await saveProductAssignments(ctx, {
      productId: 'product-1',
      nextMemberIds: [],
      unassignedReason: '  담당자 협의 중  ',
      reason: '제품 배정 변경: 담당자 협의 중',
    })

    expect(rpcMock).toHaveBeenCalledWith('replace_product_assignments_if_current', {
      p_product_id: 'product-1',
      p_member_ids: [],
      p_unassigned_reason: '담당자 협의 중',
      p_expected_updated_at: '2026-07-01T00:00:00.000Z',
      p_reason: '제품 배정 변경: 담당자 협의 중',
      p_correlation_id: expect.any(String),
    })
  })

  it('suppresses activity log when assignment replacement is a true set no-op', async () => {
    const ctx = remoteContext()
    ctx.data.products = [{ id: 'product-1', name: 'Product', updated_at: '2026-07-01T00:00:00.000Z' }]
    rpcMock.mockResolvedValueOnce({ data: '2026-07-01T00:00:00.000Z', error: null })

    const result = await saveProductAssignments(ctx, {
      productId: 'product-1',
      nextMemberIds: [],
      unassignedReason: null,
      reason: '동일 배정 재저장',
    })

    expect(result).toEqual({ noop: true })
    expect(activityLogMock).not.toHaveBeenCalled()
  })

  it('rejects saving product assignments without a known revision to check against', async () => {
    const ctx = remoteContext()
    ctx.data.products = []

    await expect(
      saveProductAssignments(ctx, { productId: 'product-1', nextMemberIds: [], reason: '배정 조정' }),
    ).rejects.toMatchObject({ message: '다른 사용자가 변경했습니다. 새로고침 후 다시 시도해 주세요.' })
    expect(rpcMock).not.toHaveBeenCalledWith('replace_product_assignments_if_current', expect.anything())
  })

  it('checks the Supabase result before writing the client activity log', async () => {
    await assignDuty(remoteContext(), { dutyId: 'duty-1', userId: 'member-1' })
    expect(trace).toEqual(['supabase', 'activity'])

    trace.length = 0
    activityLogMock.mockClear()
    rpcMock.mockImplementationOnce(async () => {
      trace.push('supabase')
      return { data: null, error: { message: 'assignment failed' } }
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
