import { canReceiveAssignment } from '../../domain/permissions'
import { assertRecordExists, UserFacingError } from '../../lib/errors'
import { makeId } from '../../lib/format'
import type { DutyMajorCategory } from '../../types'
import type { MasterRepository, RepositoryDeps } from '../repositories/types'
import { selectProductChangeTaskContexts } from '../selectors/changeTaskContexts'
import {
  appendDutyAssignment,
  appendProductAssignment,
  removeAllowedUser,
  removeDuty,
  removeDutyMajorCategory,
  removeProduct,
  replaceDutyAssignments,
  replaceProductAssignments,
  updateProductRow,
} from './appDataReducers'

function assertLocalLeader(profile: RepositoryDeps['profile']) {
  if (profile.role !== 'leader' || profile.is_active === false || profile.must_change_password === true) {
    throw new UserFacingError('활성 파트장 권한이 필요합니다.')
  }
}

function assertLocalAssignmentMembers(data: RepositoryDeps['data'], memberIds: string[]) {
  for (const memberId of new Set(memberIds)) {
    const member = data.profiles.find((item) => item.id === memberId)
    assertRecordExists(member)
    if (!canReceiveAssignment(member)) {
      throw new UserFacingError('활성 상태인 파트원에게만 배정할 수 있습니다.')
    }
  }
}

function dutyRelation(duty: {
  name: string
  major_category_id: string
  duty_major_categories?: DutyMajorCategory | Pick<DutyMajorCategory, 'name' | 'sort_order'> | null
}) {
  return {
    name: duty.name,
    major_category_id: duty.major_category_id,
    duty_major_categories: duty.duty_major_categories ?? null,
  }
}

export function createLocalMasterRepository(ctx: RepositoryDeps): MasterRepository {
  const { profile, data, setData } = ctx

  return {
    async importProducts(products) {
      assertLocalLeader(profile)
      setData((current) => ({
        ...current,
        products: [
          ...products.map((product) => ({ id: makeId('product'), ...product })),
          ...current.products,
        ],
      }))
    },

    async importInvites(invites) {
      assertLocalLeader(profile)
      setData((current) => ({
        ...current,
        allowedUsers: [
          ...invites.map((invite) => ({
            id: makeId('allowed'),
            ...invite,
            created_at: new Date().toISOString(),
          })),
          ...current.allowedUsers,
        ],
        profiles: [
          ...invites.map((invite) => ({
            id: makeId('profile'),
            ...invite,
          })),
          ...current.profiles,
        ],
      }))
    },

    async addAllowedUser(input) {
      assertLocalLeader(profile)
      setData((current) => ({
        ...current,
        allowedUsers: [{ id: makeId('allowed'), ...input, created_at: new Date().toISOString() }, ...current.allowedUsers],
        profiles: [{ id: makeId('profile'), ...input }, ...current.profiles],
      }))
    },

    async addProduct(product) {
      assertLocalLeader(profile)
      setData((current) => ({
        ...current,
        products: [{ id: makeId('product'), ...product }, ...current.products],
      }))
    },

    async addDutyMajorCategory(payload) {
      assertLocalLeader(profile)
      setData((current) => ({
        ...current,
        dutyMajorCategories: [{ id: makeId('duty-major'), ...payload }, ...current.dutyMajorCategories],
      }))
    },

    async addDuty(payload) {
      assertLocalLeader(profile)
      const majorCategory = data.dutyMajorCategories.find((item) => item.id === payload.major_category_id)
      setData((current) => ({
        ...current,
        duties: [
          {
            id: makeId('duty'),
            ...payload,
            duty_major_categories: majorCategory
              ? { name: majorCategory.name, sort_order: majorCategory.sort_order ?? null }
              : null,
          },
          ...current.duties,
        ],
      }))
    },

    async saveProductAssignments({
      productId,
      nextMemberIds,
      unassignedReason,
      product,
      memberOptions,
    }) {
      assertLocalLeader(profile)
      assertLocalAssignmentMembers(data, nextMemberIds)
      const resolvedProduct = product ?? data.products.find((item) => item.id === productId) ?? null
      assertRecordExists(resolvedProduct)
      const members = memberOptions?.map((item) => item)
        ?? data.profiles.map((item) => ({ id: item.id, name: item.name, email: item.email }))
      setData((current) =>
        replaceProductAssignments(
          current,
          productId,
          nextMemberIds,
          resolvedProduct,
          members,
          unassignedReason,
        ),
      )
    },

    async saveDutyAssignments({ dutyId, nextMemberIds, duty, memberOptions }) {
      assertLocalLeader(profile)
      assertLocalAssignmentMembers(data, nextMemberIds)
      const resolvedDuty = duty ?? data.duties.find((item) => item.id === dutyId) ?? null
      assertRecordExists(resolvedDuty)
      const members = memberOptions?.map((item) => item)
        ?? data.profiles.map((item) => ({ id: item.id, name: item.name, email: item.email }))
      const dutyForReducer = {
        ...resolvedDuty,
        duty_major_categories:
          resolvedDuty.duty_major_categories
          ?? data.dutyMajorCategories.find((item) => item.id === resolvedDuty.major_category_id)
          ?? null,
      }
      setData((current) => replaceDutyAssignments(current, dutyId, nextMemberIds, dutyForReducer, members))
    },

    async assignProduct({ userId, productId, transferPending, transferReason }) {
      assertLocalLeader(profile)
      const alreadyAssigned = data.productAssignments.some(
        (assignment) => assignment.product_id === productId && assignment.user_id === userId,
      )
      const member = data.profiles.find((item) => item.id === userId)
      const product = data.products.find((item) => item.id === productId)
      assertRecordExists(member)
      assertRecordExists(product)
      if (!canReceiveAssignment(member)) {
        throw new UserFacingError('활성 상태인 파트원에게만 제품을 배정할 수 있습니다.')
      }
      if (transferPending && !transferReason) {
        throw new UserFacingError('미완료 변경 적용업무 이관 사유가 필요합니다.')
      }
      if (alreadyAssigned && !transferPending) return { kind: 'noop' }

      const transferContexts = transferPending
        ? selectProductChangeTaskContexts(data).filter(
            ({ task, application }) =>
              task.product_id === productId
              && task.status === 'pending'
              && task.assignee_id !== userId
              && application.status === 'published',
          )
        : []
      const transferTaskIds = new Set(transferContexts.map(({ task }) => task.id))
      const now = new Date().toISOString()
      setData((current) => {
        const assigned = alreadyAssigned
          ? current
          : appendProductAssignment(current, userId, productId, member, product)
        if (!transferPending) return assigned
        return {
          ...assigned,
          productChangeTasks: assigned.productChangeTasks.map((task) => transferTaskIds.has(task.id) ? {
            ...task,
            assignee_id: userId,
            assignee_name: member.name,
            updated_at: now,
          } : task),
        }
      })

      return {
        kind: 'changed',
        action: alreadyAssigned ? 'updated' : 'created',
        assigneeName: member.name,
        includeTransferredTaskCount: true,
        transferredTasks: transferContexts.map(({ task }) => ({
          id: task.id,
          productName: task.product_name,
          fromAssigneeId: task.assignee_id,
        })),
      }
    },

    async assignDuty({ userId, dutyId }) {
      assertLocalLeader(profile)
      const alreadyAssigned = data.dutyAssignments.some(
        (assignment) => assignment.duty_id === dutyId && assignment.user_id === userId,
      )
      if (alreadyAssigned) return false
      const member = data.profiles.find((item) => item.id === userId)
      const duty = data.duties.find((item) => item.id === dutyId)
      assertRecordExists(member)
      assertRecordExists(duty)
      if (!canReceiveAssignment(member)) {
        throw new UserFacingError('활성 상태인 파트원에게만 업무를 배정할 수 있습니다.')
      }
      const dutySnapshot = dutyRelation({
        ...duty,
        duty_major_categories: data.dutyMajorCategories.find((item) => item.id === duty.major_category_id) ?? null,
      })
      setData((current) => appendDutyAssignment(current, userId, dutyId, member, dutySnapshot))
      return true
    },

    async updateProduct(productId, payload) {
      assertRecordExists(data.products.find((item) => item.id === productId))
      setData((current) => updateProductRow(current, productId, payload))
    },

    async updateDutyMajorCategory(majorCategoryId, payload) {
      assertRecordExists(data.dutyMajorCategories.find((item) => item.id === majorCategoryId))
      setData((current) => ({
        ...current,
        dutyMajorCategories: current.dutyMajorCategories.map((item) =>
          item.id === majorCategoryId ? { ...item, ...payload } : item,
        ),
        duties: current.duties.map((item) =>
          item.major_category_id === majorCategoryId
            ? {
                ...item,
                duty_major_categories: {
                  name: payload.name,
                  sort_order: payload.sort_order ?? item.duty_major_categories?.sort_order ?? null,
                },
              }
            : item,
        ),
        dutyAssignments: current.dutyAssignments.map((assignment) =>
          assignment.duties?.major_category_id === majorCategoryId
            ? {
                ...assignment,
                duties: {
                  ...(assignment.duties ?? { name: '', major_category_id: majorCategoryId }),
                  duty_major_categories: { name: payload.name },
                },
              }
            : assignment,
        ),
      }))
    },

    async updateDuty(dutyId, payload) {
      assertLocalLeader(profile)
      const majorCategory = data.dutyMajorCategories.find((item) => item.id === payload.major_category_id)
      assertRecordExists(data.duties.find((item) => item.id === dutyId))
      setData((current) => ({
        ...current,
        duties: current.duties.map((item) =>
          item.id === dutyId
            ? {
                ...item,
                ...payload,
                duty_major_categories: majorCategory
                  ? { name: majorCategory.name, sort_order: majorCategory.sort_order ?? null }
                  : item.duty_major_categories,
              }
            : item,
        ),
        dutyAssignments: current.dutyAssignments.map((assignment) =>
          assignment.duty_id === dutyId
            ? {
                ...assignment,
                duties: dutyRelation({
                  name: payload.name,
                  major_category_id: payload.major_category_id,
                  duty_major_categories: majorCategory ?? null,
                }),
              }
            : assignment,
        ),
      }))
    },

    async updateInvite(inviteId, payload) {
      assertLocalLeader(profile)
      assertRecordExists(data.allowedUsers.find((item) => item.id === inviteId))
      setData((current) => ({
        ...current,
        allowedUsers: current.allowedUsers.map((item) =>
          item.id === inviteId ? { ...item, ...payload } : item,
        ),
      }))
    },

    async toggleProfileActive(profileId, nextActive) {
      assertLocalLeader(profile)
      const target = data.profiles.find((item) => item.id === profileId)
      assertRecordExists(target)
      if (target.role === 'leader' && target.is_active !== false && !nextActive) {
        const remainingLeaders = data.profiles.filter(
          (item) => item.role === 'leader' && item.is_active !== false && item.id !== profileId,
        )
        if (remainingLeaders.length === 0) {
          throw new UserFacingError('활성 파트장은 최소 한 명 이상 유지해야 합니다.')
        }
      }
      setData((current) => ({
        ...current,
        profiles: current.profiles.map((item) =>
          item.id === profileId ? { ...item, is_active: nextActive } : item,
        ),
      }))
    },

    async deleteAllowedUser(id) {
      assertLocalLeader(profile)
      const invite = data.allowedUsers.find((item) => item.id === id)
      assertRecordExists(invite)
      setData((current) => removeAllowedUser(current, id))
      return invite.name
    },

    async deleteProduct(id) {
      assertLocalLeader(profile)
      const product = data.products.find((item) => item.id === id)
      assertRecordExists(product)
      if (data.productChangeTasks.some((task) => task.product_id === id)) {
        throw new UserFacingError('변경 적용 이력이 있는 제품은 삭제할 수 없습니다. 제품 이력을 유지해 주세요.')
      }
      setData((current) => removeProduct(current, id))
      return product.name
    },

    async deleteDuty(id) {
      assertLocalLeader(profile)
      const duty = data.duties.find((item) => item.id === id)
      assertRecordExists(duty)
      setData((current) => removeDuty(current, id))
      return duty.name
    },

    async deleteDutyMajorCategory(id) {
      assertLocalLeader(profile)
      const category = data.dutyMajorCategories.find((item) => item.id === id)
      assertRecordExists(category)
      if (data.duties.some((item) => item.major_category_id === id)) {
        throw new UserFacingError('소속된 업무가 있어 대분류를 삭제할 수 없습니다. 먼저 업무를 이동하거나 삭제하세요.')
      }
      setData((current) => removeDutyMajorCategory(current, id))
      return category.name
    },
  }
}
