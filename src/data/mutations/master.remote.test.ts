import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Profile } from '../../types'
import type { RepositoryContext } from '../repositoryContext'

const { rpcMock, fromMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async () => ({ error: null })),
  fromMock: vi.fn(() => ({ insert: vi.fn(async () => ({ error: null })) })),
}))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { rpc: rpcMock, from: fromMock },
}))

import { assignDuty, assignProduct } from './master'

const leader: Profile = {
  id: 'leader-1',
  email: 'leader@example.com',
  name: 'Leader',
  role: 'leader',
}

function remoteContext(): RepositoryContext {
  const data: AppData = {
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
  return { isRemote: true, profile: leader, data, setData: vi.fn() }
}

describe('single assignment RPC contracts (remote)', () => {
  beforeEach(() => {
    rpcMock.mockClear()
    fromMock.mockClear()
  })

  it('adds a product assignment without replacing the server-side assignment list', async () => {
    await assignProduct(remoteContext(), { productId: 'product-1', userId: 'member-1' })

    expect(rpcMock).toHaveBeenCalledWith('add_product_assignment', {
      p_product_id: 'product-1',
      p_user_id: 'member-1',
    })
    expect(rpcMock).not.toHaveBeenCalledWith('replace_product_assignments', expect.anything())
  })

  it('adds a duty assignment without replacing the server-side assignment list', async () => {
    await assignDuty(remoteContext(), { dutyId: 'duty-1', userId: 'member-1' })

    expect(rpcMock).toHaveBeenCalledWith('add_duty_assignment', {
      p_duty_id: 'duty-1',
      p_user_id: 'member-1',
    })
    expect(rpcMock).not.toHaveBeenCalledWith('replace_duty_assignments', expect.anything())
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
})
