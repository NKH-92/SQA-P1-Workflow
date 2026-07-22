import { UserFacingError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { ProductAdminRepository, RepositoryDeps } from '../repositories/types'
import {
  assertMasterVersion,
  makeMasterCorrelationId,
  normalizeMasterReason,
  runMasterOccRpc,
  throwMasterOccError,
} from './supabaseMasterShared'

export function createSupabaseProductAdminRepository(ctx: RepositoryDeps): ProductAdminRepository {
  const { data, setData } = ctx

  return {
    async importProducts(products) {
      const { error } = await supabase!.from('products').insert(products)
      if (error) throw error
    },

    async addProduct(product) {
      const { error } = await supabase!.from('products').insert(product)
      if (error) throw error
    },

    // expected_updated_at is resolved from whatever revision the caller
    // already has -- either the Product object it passed in, or (when the panel
    // only passed an id) the snapshot already loaded into `data`. Either way
    // this is the same "last synced" revision the rest of the app already
    // treats as current; a real race is still caught server-side because the
    // RPC re-reads and locks the row before comparing.
    async saveProductAssignments({ productId, nextMemberIds, unassignedReason, reason, product, expectedUpdatedAt }) {
      const resolvedExpectedUpdatedAt = assertMasterVersion(
        expectedUpdatedAt ?? product?.updated_at ?? data.products.find((item) => item.id === productId)?.updated_at,
      )
      const updatedAt = await runMasterOccRpc<string>('replace_product_assignments_if_current', {
        p_product_id: productId,
        p_member_ids: nextMemberIds,
        p_unassigned_reason: unassignedReason,
        p_expected_updated_at: resolvedExpectedUpdatedAt,
        p_reason: normalizeMasterReason(reason),
        p_correlation_id: makeMasterCorrelationId(),
      })
      // True no-op returns the same revision; D-05 forbids activity/audit for no-ops.
      const noop = typeof updatedAt === 'string' && updatedAt === resolvedExpectedUpdatedAt
      if (typeof updatedAt === 'string' && !noop) {
        setData((current) => ({
          ...current,
          products: current.products.map((item) => (item.id === productId ? { ...item, updated_at: updatedAt } : item)),
        }))
      }
      return { noop }
    },

    async assignProduct({ userId, productId, transferPending, transferReason }) {
      if (transferPending) {
        const { error } = await supabase!.rpc('assign_product_and_transfer_change_tasks', {
          p_product_id: productId,
          p_user_id: userId,
          p_transfer_pending: true,
          p_reason: transferReason,
        })
        if (error) throw error
        return { kind: 'server-audited' }
      }
      // try_add_product_assignment returns whether a row was actually inserted —
      // ON CONFLICT DO NOTHING means the assignment can already exist, and callers must
      // not record a "배정했습니다" activity log for a no-op.
      const { data: inserted, error } = await supabase!.rpc('try_add_product_assignment', {
        p_product_id: productId,
        p_user_id: userId,
      })
      if (error) throw error
      if (!inserted) return { kind: 'noop' }
      return {
        kind: 'changed',
        action: 'created',
        assigneeName: '',
        includeTransferredTaskCount: false,
        transferredTasks: [],
      }
    },

    // update_product_if_current returns the same expected_updated_at
    // unchanged (no bump, no write) when nothing in the payload actually
    // differs from the stored row. That makes "did this call change anything"
    // a plain revision comparison here, with no separate round trip needed.
    async updateProduct(productId, payload) {
      const reason = normalizeMasterReason(payload.reason)
      const expectedUpdatedAt = assertMasterVersion(payload.expectedUpdatedAt)
      const updatedAt = await runMasterOccRpc<string>('update_product_if_current', {
        p_product_id: productId,
        p_expected_updated_at: expectedUpdatedAt,
        p_name: payload.name,
        p_category: payload.category ?? null,
        p_company_name: payload.company_name ?? null,
        p_unassigned_reason: payload.unassigned_reason ?? null,
        p_sort_order: payload.sort_order ?? null,
        p_reason: reason,
        p_correlation_id: makeMasterCorrelationId(),
      })
      if (typeof updatedAt === 'string') {
        setData((current) => ({
          ...current,
          products: current.products.map((item) => (item.id === productId ? { ...item, updated_at: updatedAt } : item)),
        }))
      }
      return { noop: updatedAt === expectedUpdatedAt }
    },

    async deleteProduct(id, input) {
      const product = data.products.find((item) => item.id === id)
      const { error } = await supabase!.rpc('delete_product_if_current', {
        p_id: id,
        p_expected_updated_at: assertMasterVersion(input.expectedUpdatedAt),
        p_reason: normalizeMasterReason(input.reason),
        p_correlation_id: makeMasterCorrelationId(),
      })
      if (error?.code === '23503') {
        throw new UserFacingError('변경 적용 이력이 있는 제품은 삭제할 수 없습니다. 제품 이력을 유지해 주세요.')
      }
      throwMasterOccError(error)
      return product?.name ?? null
    },
  }
}
