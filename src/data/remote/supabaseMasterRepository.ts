import { assertAffectedRows, UserFacingError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { MasterRepository, RepositoryDeps } from '../repositories/types'

export function createSupabaseMasterRepository(ctx: RepositoryDeps): MasterRepository {
  const { profile, data } = ctx

  return {
    async importProducts(products) {
      const { error } = await supabase!.from('products').insert(products)
      if (error) throw error
    },

    async importInvites(invites) {
      const { error } = await supabase!.from('allowed_users').insert(
        invites.map((invite) => ({ ...invite, created_by: profile.id })),
      )
      if (error) throw error
    },

    async addAllowedUser(input) {
      const { error } = await supabase!.from('allowed_users').insert({
        ...input,
        created_by: profile.id,
      })
      if (error) throw error
    },

    async addProduct(product) {
      const { error } = await supabase!.from('products').insert(product)
      if (error) throw error
    },

    async addDutyMajorCategory(payload) {
      const { error } = await supabase!.from('duty_major_categories').insert(payload)
      if (error) throw error
    },

    async addDuty(payload) {
      const { error } = await supabase!.from('duties').insert(payload)
      if (error) throw error
    },

    async saveProductAssignments({ productId, nextMemberIds, unassignedReason }) {
      const { error } = await supabase!.rpc('replace_product_assignments_with_reason', {
        p_product_id: productId,
        p_member_ids: nextMemberIds,
        p_unassigned_reason: unassignedReason,
      })
      if (error) throw error
    },

    async saveDutyAssignments({ dutyId, nextMemberIds }) {
      const { error } = await supabase!.rpc('replace_duty_assignments', {
        p_duty_id: dutyId,
        p_member_ids: nextMemberIds,
      })
      if (error) throw error
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
      const { error } = await supabase!.rpc('add_product_assignment', {
        p_product_id: productId,
        p_user_id: userId,
      })
      if (error) throw error
      return {
        kind: 'changed',
        action: 'created',
        assigneeName: '',
        includeTransferredTaskCount: false,
        transferredTasks: [],
      }
    },

    async assignDuty({ userId, dutyId }) {
      const { error } = await supabase!.rpc('add_duty_assignment', {
        p_duty_id: dutyId,
        p_user_id: userId,
      })
      if (error) throw error
      return true
    },

    async updateProduct(productId, payload) {
      const { data: affected, error } = await supabase!
        .from('products')
        .update(payload)
        .eq('id', productId)
        .select('id')
      if (error) throw error
      assertAffectedRows(affected)
    },

    async updateDutyMajorCategory(majorCategoryId, payload) {
      const { data: affected, error } = await supabase!
        .from('duty_major_categories')
        .update(payload)
        .eq('id', majorCategoryId)
        .select('id')
      if (error) throw error
      assertAffectedRows(affected)
    },

    async updateDuty(dutyId, payload) {
      const { data: affected, error } = await supabase!
        .from('duties')
        .update(payload)
        .eq('id', dutyId)
        .select('id')
      if (error) throw error
      assertAffectedRows(affected)
    },

    async updateInvite(inviteId, payload) {
      const { data: affected, error } = await supabase!
        .from('allowed_users')
        .update(payload)
        .eq('id', inviteId)
        .select('id')
      if (error) throw error
      assertAffectedRows(affected)
    },

    async toggleProfileActive(profileId, nextActive) {
      const { data: affected, error } = await supabase!
        .from('profiles')
        .update({ is_active: nextActive })
        .eq('id', profileId)
        .select('id')
      if (error) throw error
      assertAffectedRows(affected)
    },

    async deleteAllowedUser(id) {
      const invite = data.allowedUsers.find((item) => item.id === id)
      const { data: affected, error } = await supabase!
        .from('allowed_users')
        .delete()
        .eq('id', id)
        .select('id')
      if (error) throw error
      assertAffectedRows(affected)
      return invite?.name ?? null
    },

    async deleteProduct(id) {
      const product = data.products.find((item) => item.id === id)
      const { data: affected, error } = await supabase!
        .from('products')
        .delete()
        .eq('id', id)
        .select('id')
      if (error?.code === '23503') {
        throw new UserFacingError('변경 적용 이력이 있는 제품은 삭제할 수 없습니다. 제품 이력을 유지해 주세요.')
      }
      if (error) throw error
      assertAffectedRows(affected)
      return product?.name ?? null
    },

    async deleteDuty(id) {
      const duty = data.duties.find((item) => item.id === id)
      const { data: affected, error } = await supabase!
        .from('duties')
        .delete()
        .eq('id', id)
        .select('id')
      if (error) throw error
      assertAffectedRows(affected)
      return duty?.name ?? null
    },

    async deleteDutyMajorCategory(id) {
      const category = data.dutyMajorCategories.find((item) => item.id === id)
      const { data: affected, error } = await supabase!
        .from('duty_major_categories')
        .delete()
        .eq('id', id)
        .select('id')
      if (error) throw error
      assertAffectedRows(affected)
      return category?.name ?? null
    },
  }
}
