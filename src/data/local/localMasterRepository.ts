import { recordActivityLog } from '../../lib/activityLog'
import { assertRecordExists, UserFacingError } from '../../lib/errors'
import type { RepositoryDeps, MasterRepository } from '../repositories/types'
import {
  removeAllowedUser,
  removeDuty,
  removeDutyMajorCategory,
  removeProduct,
} from './appDataReducers'

export function createLocalMasterRepository(ctx: RepositoryDeps): MasterRepository {
  const { profile, data, setData } = ctx
  if (profile.role !== 'leader' || profile.is_active === false || profile.must_change_password === true) {
    throw new UserFacingError('활성 파트장 권한이 필요합니다.')
  }

  return {
    async deleteAllowedUser(id) {
      const invite = data.allowedUsers.find((item) => item.id === id)
      assertRecordExists(invite)
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
      assertRecordExists(product)
      if (data.productChangeTasks.some((task) => task.product_id === id)) {
        throw new UserFacingError('변경 적용 이력이 있는 제품은 삭제할 수 없습니다. 제품 이력을 유지해 주세요.')
      }
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
      assertRecordExists(duty)
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
      assertRecordExists(category)
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
