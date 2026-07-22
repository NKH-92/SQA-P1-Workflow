import { describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader } from '../../demoData'
import { createRepositoryContextFromDeps, type RepositoryContext } from '../repositoryContext'
import { deleteProduct, updateProduct } from './master'

/**
 * Local preview must reject exactly the same stale/reason-required
 * conditions as the remote `*_if_current` RPCs, with the same unified
 * user-facing message (masterOcc.remote.test.ts asserts the remote side).
 */
function context(): RepositoryContext {
  const data = createPreviewData()
  return createRepositoryContextFromDeps('local', { profile: previewLeader, data, setData: vi.fn() })
}

describe('local master OCC parity', () => {
  it('rejects a stale update with the same message the remote RPC produces', async () => {
    const ctx = context()
    const product = ctx.data.products[0]!
    await expect(
      updateProduct(ctx, product.id, {
        name: 'Renamed while stale',
        expectedUpdatedAt: '2000-01-01T00:00:00.000Z',
        reason: '사유',
      }),
    ).rejects.toThrow('다른 사용자가 변경했습니다. 새로고침 후 다시 시도해 주세요.')
  })

  it('rejects an update with a blank reason with the same message the remote RPC produces', async () => {
    const ctx = context()
    const product = ctx.data.products[0]!
    await expect(
      updateProduct(ctx, product.id, {
        name: 'Renamed without reason',
        expectedUpdatedAt: product.updated_at ?? null,
        reason: '   ',
      }),
    ).rejects.toThrow('변경 사유를 입력해 주세요.')
  })

  it('rejects a delete when the revision captured at confirmation-open is stale', async () => {
    const ctx = context()
    const product = ctx.data.products[0]!
    ctx.data.productChangeTasks = []
    await expect(deleteProduct(ctx, product.id, {
      expectedUpdatedAt: '2000-01-01T00:00:00.000Z',
      reason: '중복 데이터 정리',
    })).rejects.toThrow('다른 사용자가 변경했습니다. 새로고침 후 다시 시도해 주세요.')
    expect(ctx.setData).not.toHaveBeenCalled()
  })

  it('rejects a blank delete reason before mutating local preview data', async () => {
    const ctx = context()
    const product = ctx.data.products[0]!
    ctx.data.productChangeTasks = []
    await expect(deleteProduct(ctx, product.id, {
      expectedUpdatedAt: product.updated_at ?? null,
      reason: '   ',
    })).rejects.toThrow('변경 사유를 입력해 주세요.')
    expect(ctx.setData).not.toHaveBeenCalled()
  })

  it('preserves a concurrent actor B change when actor A saves with a stale snapshot (two-actor race)', async () => {
    const ctx = context()
    const product = ctx.data.products[0]!
    let liveData = ctx.data
    ctx.setData = (updater) => {
      liveData = typeof updater === 'function' ? updater(liveData) : updater
      ctx.data = liveData
    }

    // Actor A and actor B both open the editor at the same revision.
    const snapshotAtOpen = product.updated_at ?? null

    // Actor B saves first: their change lands and the revision advances.
    await updateProduct(ctx, product.id, {
      name: 'Actor B name',
      category: product.category,
      company_name: product.company_name,
      sort_order: product.sort_order,
      expectedUpdatedAt: snapshotAtOpen,
      reason: 'Actor B 변경',
    })
    expect(liveData.products.find((item) => item.id === product.id)?.name).toBe('Actor B name')

    // Actor A still holds the pre-B snapshot and tries to save over it.
    await expect(
      updateProduct(ctx, product.id, {
        name: 'Actor A name',
        category: product.category,
        company_name: product.company_name,
        sort_order: product.sort_order,
        expectedUpdatedAt: snapshotAtOpen,
        reason: 'Actor A 변경',
      }),
    ).rejects.toThrow('다른 사용자가 변경했습니다. 새로고침 후 다시 시도해 주세요.')

    // Actor B's committed name is untouched by actor A's rejected, stale save.
    expect(liveData.products.find((item) => item.id === product.id)?.name).toBe('Actor B name')
  })
})
