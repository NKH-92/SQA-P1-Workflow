import { recordActivityLog } from '../../lib/activityLog'
import { supabase } from '../../lib/supabase'
import type { LocalRepositoryContext, MasterRepository } from '../repositories/types'

export function createSupabaseMasterRepository(ctx: LocalRepositoryContext): MasterRepository {
  const { profile, data, setData } = ctx

  return {
    async deleteAllowedUser(id) {
      const invite = data.allowedUsers.find((item) => item.id === id)
      const { error } = await supabase!.from('allowed_users').delete().eq('id', id)
      if (error) throw error
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'allowed_user',
        entityId: id,
        action: 'deleted',
        summary: `${invite?.name ?? '초대'} 사용자를 삭제했습니다.`,
      }, { isRemote: true })
    },

    async deleteProduct(id) {
      const product = data.products.find((item) => item.id === id)
      const { error } = await supabase!.from('products').delete().eq('id', id)
      if (error) throw error
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'product',
        entityId: id,
        action: 'deleted',
        summary: `${product?.name ?? '제품'}을 삭제했습니다.`,
      }, { isRemote: true })
    },

    async deleteDuty(id) {
      const duty = data.duties.find((item) => item.id === id)
      const { error } = await supabase!.from('duties').delete().eq('id', id)
      if (error) throw error
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'duty',
        entityId: id,
        action: 'deleted',
        summary: `${duty?.name ?? '업무'}를 삭제했습니다.`,
      }, { isRemote: true })
    },

    async deleteDutyMajorCategory(id) {
      const category = data.dutyMajorCategories.find((item) => item.id === id)
      const { error } = await supabase!.from('duty_major_categories').delete().eq('id', id)
      if (error) throw error
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'duty_major_category',
        entityId: id,
        action: 'deleted',
        summary: `${category?.name ?? '대분류'}를 삭제했습니다.`,
      }, { isRemote: true })
    },

    async deleteProductAssignment(id) {
      const assignment = data.productAssignments.find((item) => item.id === id)
      const { error } = await supabase!.from('product_assignments').delete().eq('id', id)
      if (error) throw error
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: assignment?.user_id ?? null,
        entityType: 'product_assignment',
        entityId: id,
        action: 'deleted',
        summary: `제품 배정을 삭제했습니다.`,
        metadata: { product_id: assignment?.product_id },
      }, { isRemote: true })
    },

    async deleteDutyAssignment(id) {
      const assignment = data.dutyAssignments.find((item) => item.id === id)
      const { error } = await supabase!.from('duty_assignments').delete().eq('id', id)
      if (error) throw error
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: assignment?.user_id ?? null,
        entityType: 'duty_assignment',
        entityId: id,
        action: 'deleted',
        summary: `업무 배정을 삭제했습니다.`,
        metadata: { duty_id: assignment?.duty_id },
      }, { isRemote: true })
    },
  }
}
