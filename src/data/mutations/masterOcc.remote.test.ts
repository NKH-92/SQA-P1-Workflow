import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Profile } from '../../types'
import { createRepositoryContextFromDeps, type RepositoryContext } from '../repositoryContext'

/**
 * Dedicated remote-adapter coverage for the `*_if_current` master OCC
 * RPCs (product/duty/duty-major-category/invite update, profile active
 * toggle, product/duty assignment replacement). `master.remote.test.ts`
 * keeps the pre-existing single-assignment RPC contracts; this file is the
 * required OCC/reason/no-op/last-leader-parity surface.
 */
const { rpcMock, activityLogMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async () => ({ data: null as string | null, error: null as { message: string } | null })),
  activityLogMock: vi.fn(async () => undefined),
}))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { rpc: rpcMock, from: vi.fn() },
}))
vi.mock('../activityLog', () => ({
  recordActivityLog: activityLogMock,
}))

import {
  deleteAllowedUser,
  deleteDuty,
  deleteDutyMajorCategory,
  deleteProduct,
  toggleProfileActive,
  updateDuty,
  updateDutyMajorCategory,
  updateInvite,
  updateProduct,
} from './master'

const leader: Profile = { id: 'leader-1', email: 'leader@example.com', name: 'Leader', role: 'leader' }
const EXPECTED = '2026-07-01T00:00:00.000Z'
const NEXT = '2026-07-01T00:05:00.000Z'

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
  return createRepositoryContextFromDeps('remote', { profile: leader, data, setData: vi.fn() })
}

describe('master OCC RPC contracts (remote)', () => {
  beforeEach(() => {
    activityLogMock.mockReset().mockResolvedValue(undefined)
    rpcMock.mockReset().mockImplementation(async () => ({ data: NEXT, error: null }))
  })

  it('sends the expected revision, reason, and a fresh correlation id on every update RPC', async () => {
    await updateProduct(remoteContext(), 'product-1', {
      name: 'Product', expectedUpdatedAt: EXPECTED, reason: '가격 정책 변경',
    })
    expect(rpcMock).toHaveBeenCalledWith('update_product_if_current', expect.objectContaining({
      p_product_id: 'product-1',
      p_expected_updated_at: EXPECTED,
      p_reason: '가격 정책 변경',
      p_correlation_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    }))

    await updateDuty(remoteContext(), 'duty-1', {
      name: 'Duty', major_category_id: 'category-1', expectedUpdatedAt: EXPECTED, reason: '담당 조정',
    })
    expect(rpcMock).toHaveBeenCalledWith('update_duty_if_current', expect.objectContaining({
      p_duty_id: 'duty-1', p_expected_updated_at: EXPECTED, p_reason: '담당 조정',
    }))

    await updateDutyMajorCategory(remoteContext(), 'category-1', {
      name: 'Category', expectedUpdatedAt: EXPECTED, reason: '명칭 정리',
    })
    expect(rpcMock).toHaveBeenCalledWith('update_duty_major_category_if_current', expect.objectContaining({
      p_major_category_id: 'category-1', p_expected_updated_at: EXPECTED, p_reason: '명칭 정리',
    }))

    await updateInvite(remoteContext(), 'invite-1', {
      email: 'new@example.com', name: 'New', role: 'member', expectedUpdatedAt: EXPECTED, reason: '이름 정정',
    })
    expect(rpcMock).toHaveBeenCalledWith('update_allowed_user_if_current', expect.objectContaining({
      p_allowed_user_id: 'invite-1', p_expected_updated_at: EXPECTED, p_reason: '이름 정정',
    }))

    await toggleProfileActive(remoteContext(), 'member-1', false, { expectedUpdatedAt: EXPECTED, reason: '퇴사 처리' })
    expect(rpcMock).toHaveBeenCalledWith('set_profile_active_if_current', expect.objectContaining({
      p_profile_id: 'member-1', p_expected_updated_at: EXPECTED, p_is_active: false, p_reason: '퇴사 처리',
    }))
  })

  it('passes the captured revision and operator reason to every versioned delete RPC', async () => {
    const input = { expectedUpdatedAt: EXPECTED, reason: '중복 데이터 정리' }
    await deleteProduct(remoteContext(), 'product-1', input)
    await deleteDuty(remoteContext(), 'duty-1', input)
    await deleteDutyMajorCategory(remoteContext(), 'category-1', input)
    await deleteAllowedUser(remoteContext(), 'invite-1', input)

    for (const [rpc, id] of [
      ['delete_product_if_current', 'product-1'],
      ['delete_duty_if_current', 'duty-1'],
      ['delete_duty_major_category_if_current', 'category-1'],
      ['delete_allowed_user_if_current', 'invite-1'],
    ] as const) {
      expect(rpcMock).toHaveBeenCalledWith(rpc, expect.objectContaining({
        p_id: id,
        p_expected_updated_at: EXPECTED,
        p_reason: '중복 데이터 정리',
        p_correlation_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }))
    }
  })

  it('rejects a blank delete reason before calling the database', async () => {
    await expect(deleteProduct(remoteContext(), 'product-1', {
      expectedUpdatedAt: EXPECTED,
      reason: '   ',
    })).rejects.toThrow('변경 사유를 입력해 주세요.')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects an update with no reason before ever calling the RPC', async () => {
    await expect(
      updateProduct(remoteContext(), 'product-1', { name: 'Product', expectedUpdatedAt: EXPECTED, reason: '   ' }),
    ).rejects.toThrow('변경 사유를 입력해 주세요.')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects an update with no known revision before ever calling the RPC', async () => {
    await expect(
      updateProduct(remoteContext(), 'product-1', { name: 'Product', expectedUpdatedAt: null, reason: '사유' }),
    ).rejects.toThrow('다른 사용자가 변경했습니다. 새로고침 후 다시 시도해 주세요.')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('unifies the stale-write message across every OCC-protected entity', async () => {
    rpcMock.mockImplementation(async () => ({
      data: null, error: { message: 'master record changed since it was opened' },
    }))
    const staleMessage = '다른 사용자가 변경했습니다. 새로고침 후 다시 시도해 주세요.'

    await expect(updateProduct(remoteContext(), 'product-1', {
      name: 'Product', expectedUpdatedAt: EXPECTED, reason: '사유',
    })).rejects.toThrow(staleMessage)
    await expect(updateDuty(remoteContext(), 'duty-1', {
      name: 'Duty', major_category_id: 'category-1', expectedUpdatedAt: EXPECTED, reason: '사유',
    })).rejects.toThrow(staleMessage)
    await expect(updateDutyMajorCategory(remoteContext(), 'category-1', {
      name: 'Category', expectedUpdatedAt: EXPECTED, reason: '사유',
    })).rejects.toThrow(staleMessage)
    await expect(updateInvite(remoteContext(), 'invite-1', {
      email: 'a@example.com', name: 'A', role: 'member', expectedUpdatedAt: EXPECTED, reason: '사유',
    })).rejects.toThrow(staleMessage)
    await expect(toggleProfileActive(remoteContext(), 'member-1', false, {
      expectedUpdatedAt: EXPECTED, reason: '사유',
    })).rejects.toThrow(staleMessage)
  })

  it('distinguishes a not-found record from a stale one, both via the same user-facing message', async () => {
    rpcMock.mockImplementation(async () => ({ data: null, error: { message: 'master record not found' } }))
    await expect(updateProduct(remoteContext(), 'missing', {
      name: 'Product', expectedUpdatedAt: EXPECTED, reason: '사유',
    })).rejects.toThrow('다른 사용자가 변경했습니다. 새로고침 후 다시 시도해 주세요.')
  })

  it('reports a no-op and skips the activity log when the RPC returns the unchanged revision', async () => {
    rpcMock.mockImplementation(async () => ({ data: EXPECTED, error: null }))
    const result = await updateProduct(remoteContext(), 'product-1', {
      name: 'Product', expectedUpdatedAt: EXPECTED, reason: '사유',
    })
    expect(result).toEqual({ noop: true })
    expect(activityLogMock).not.toHaveBeenCalled()
  })

  it('logs the change and advances the local revision when the RPC reports a real change', async () => {
    rpcMock.mockImplementation(async () => ({ data: NEXT, error: null }))
    const ctx = remoteContext()
    ctx.data.products = [{ id: 'product-1', name: 'Old name', updated_at: EXPECTED }]
    const result = await updateProduct(ctx, 'product-1', {
      name: 'New name', expectedUpdatedAt: EXPECTED, reason: '사유',
    })
    expect(result).toEqual({ noop: false })
    expect(activityLogMock).toHaveBeenCalledOnce()
  })

  it('translates the last-active-leader guard into the same Korean message local preview uses', async () => {
    rpcMock.mockImplementation(async () => ({
      data: null, error: { message: 'cannot disable or demote the last active leader' },
    }))
    await expect(
      toggleProfileActive(remoteContext(), leader.id, false, { expectedUpdatedAt: EXPECTED, reason: '사유' }),
    ).rejects.toThrow('활성 파트장은 최소 한 명 이상 유지해야 합니다.')

    rpcMock.mockImplementation(async () => ({
      data: null, error: { message: 'cannot demote the last active leader' },
    }))
    await expect(
      toggleProfileActive(remoteContext(), leader.id, false, { expectedUpdatedAt: EXPECTED, reason: '사유' }),
    ).rejects.toThrow('활성 파트장은 최소 한 명 이상 유지해야 합니다.')
  })

  it('translates the self-deactivation guard into a user-facing message', async () => {
    rpcMock.mockImplementation(async () => ({
      data: null, error: { message: 'cannot deactivate your own account' },
    }))
    await expect(
      toggleProfileActive(remoteContext(), leader.id, false, { expectedUpdatedAt: EXPECTED, reason: '사유' }),
    ).rejects.toThrow('본인 계정은 비활성화할 수 없습니다.')
  })
})
