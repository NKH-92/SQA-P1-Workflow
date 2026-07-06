import { recordActivityLog } from '../../lib/activityLog'
import type { LocalRepositoryContext, MasterRepository } from '../repositories/types'
import {
  removeAllowedUser,
  removeDuty,
  removeDutyAssignment,
  removeDutyMajorCategory,
  removeProduct,
  removeProductAssignment,
} from './appDataReducers'

export function createLocalMasterRepository(ctx: LocalRepositoryContext): MasterRepository {
  const { profile, data, setData } = ctx

  return {
    async deleteAllowedUser(id) {
      const invite = data.allowedUsers.find((item) => item.id === id)
      setData((current) => removeAllowedUser(current, id))
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'allowed_user',
        entityId: id,
        action: 'deleted',
        summary: `${invite?.name ?? '초대'} 사용자를 삭제했습니다.`,
      })
    },

    async deleteProduct(id) {
      const product = data.products.find((item) => item.id === id)
      setData((current) => removeProduct(current, id))
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'product',
        entityId: id,
        action: 'deleted',
        summary: `${product?.name ?? '제품'}을 삭제했습니다.`,
      })
    },

    async deleteDuty(id) {
      const duty = data.duties.find((item) => item.id === id)
      setData((current) => removeDuty(current, id))
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'duty',
        entityId: id,
        action: 'deleted',
        summary: `${duty?.name ?? '업무'}를 삭제했습니다.`,
      })
    },

    async deleteDutyMajorCategory(id) {
      const category = data.dutyMajorCategories.find((item) => item.id === id)
      setData((current) => removeDutyMajorCategory(current, id))
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'duty_major_category',
        entityId: id,
        action: 'deleted',
        summary: `${category?.name ?? '대분류'}를 삭제했습니다.`,
      })
    },

    async deleteProductAssignment(id) {
      const assignment = data.productAssignments.find((item) => item.id === id)
      setData((current) => removeProductAssignment(current, id))
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: assignment?.user_id ?? null,
        entityType: 'product_assignment',
        entityId: id,
        action: 'deleted',
        summary: `제품 배정을 삭제했습니다.`,
        metadata: { product_id: assignment?.product_id },
      })
    },

    async deleteDutyAssignment(id) {
      const assignment = data.dutyAssignments.find((item) => item.id === id)
      setData((current) => removeDutyAssignment(current, id))
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: assignment?.user_id ?? null,
        entityType: 'duty_assignment',
        entityId: id,
        action: 'deleted',
        summary: `업무 배정을 삭제했습니다.`,
        metadata: { duty_id: assignment?.duty_id },
      })
    },
  }
}
