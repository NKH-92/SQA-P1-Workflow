import { recordActivityLog } from '../../lib/activityLog'
import { UserFacingError } from '../../lib/errors'
import type { RepositoryDeps, MasterRepository } from '../repositories/types'
import {
  removeAllowedUser,
  removeDuty,
  removeDutyMajorCategory,
  removeProduct,
} from './appDataReducers'

export function createLocalMasterRepository(ctx: RepositoryDeps): MasterRepository {
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
      // Mirror the remote `major_category_id ... on delete restrict`: refuse deletion while
      // duties still belong to the category, instead of silently orphaning them in demo mode.
      if (data.duties.some((item) => item.major_category_id === id)) {
        throw new UserFacingError('소속된 업무가 있어 대분류를 삭제할 수 없습니다. 먼저 업무를 이동하거나 삭제하세요.')
      }
      setData((current) => removeDutyMajorCategory(current, id))
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'duty_major_category',
        entityId: id,
        action: 'deleted',
        summary: `${category?.name ?? '대분류'}를 삭제했습니다.`,
      })
    },
  }
}
