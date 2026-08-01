import { canReceiveAssignment } from '../../domain/permissions'
import { assertRecordExists, UserFacingError } from '../../lib/errors'
import { makeId } from '../../lib/format'
import type { ProductAdminRepository, RepositoryDeps } from '../repositories/types'
import { selectProductChangeTaskContexts } from '../selectors/changeTaskContexts'
import { normalizeMasterReason } from '../validation/masterOcc'
import { changeTaskAssigneeHistory } from '../../domain/changeApplications/assigneeHistory'
import {
  appendProductAssignment,
  removeProduct,
  replaceProductAssignments,
  updateProductRow,
} from './appDataReducers'
import {
  assertLocalAssignmentMembers,
  assertLocalLeader,
  assertLocalMasterCurrent,
} from './localAdminGuards'

export function createLocalProductAdminRepository(deps: RepositoryDeps): ProductAdminRepository {
  const { profile, data, setData } = deps

  return {
    async importProducts(products) {
      assertLocalLeader(profile)
      const now = new Date().toISOString()
      setData((current) => ({
        ...current,
        products: [
          ...products.map((product) => ({ id: makeId('product'), ...product, created_at: now, updated_at: now })),
          ...current.products,
        ],
      }))
    },

    async addProduct(product) {
      assertLocalLeader(profile)
      const now = new Date().toISOString()
      setData((current) => ({
        ...current,
        products: [{ id: makeId('product'), ...product, created_at: now, updated_at: now }, ...current.products],
      }))
    },

    async saveProductAssignments({
      productId,
      nextMemberIds,
      unassignedReason,
      reason,
      product,
      memberOptions,
      expectedUpdatedAt,
    }) {
      assertLocalLeader(profile)
      normalizeMasterReason(reason)
      assertLocalAssignmentMembers(data, nextMemberIds)
      const resolvedProduct = product ?? data.products.find((item) => item.id === productId) ?? null
      assertRecordExists(resolvedProduct)
      assertLocalMasterCurrent(resolvedProduct, expectedUpdatedAt ?? resolvedProduct.updated_at)
      const nextIds = [...new Set(nextMemberIds)].sort()
      const existingIds = data.productAssignments
        .filter((assignment) => assignment.product_id === productId)
        .map((assignment) => assignment.user_id)
        .sort()
      const nextUnassigned = nextIds.length === 0 ? (unassignedReason?.trim() || null) : null
      const currentUnassigned = nextIds.length === 0 ? (resolvedProduct.unassigned_reason ?? null) : null
      if (
        nextIds.length === existingIds.length
        && nextIds.every((id, index) => id === existingIds[index])
        && (nextIds.length > 0 || nextUnassigned === currentUnassigned)
      ) {
        return { noop: true }
      }
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
      return { noop: false }
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
      if (alreadyAssigned && transferTaskIds.size === 0) return { kind: 'noop' }
      const now = new Date().toISOString()
      setData((current) => {
        const assigned = alreadyAssigned
          ? current
          : appendProductAssignment(current, userId, productId, member, product)
        const withRevision = alreadyAssigned ? assigned : {
          ...assigned,
          products: assigned.products.map((item) => item.id === productId ? { ...item, updated_at: now } : item),
        }
        if (!transferPending) return withRevision
        return {
          ...withRevision,
          productChangeTasks: withRevision.productChangeTasks.map((task) => transferTaskIds.has(task.id) ? {
            ...task,
            assignee_history_ids: changeTaskAssigneeHistory(task, userId),
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

    async updateProduct(productId, payload) {
      assertLocalLeader(profile)
      const current = data.products.find((item) => item.id === productId)
      assertRecordExists(current)
      normalizeMasterReason(payload.reason)
      assertLocalMasterCurrent(current, payload.expectedUpdatedAt)
      const { expectedUpdatedAt: _expectedUpdatedAt, reason: _reason, ...fields } = payload
      const changed =
        current.name !== fields.name
        || (current.category ?? null) !== (fields.category ?? null)
        || (current.company_name ?? null) !== (fields.company_name ?? null)
        || (current.unassigned_reason ?? null) !== (fields.unassigned_reason ?? null)
        || (current.sort_order ?? null) !== (fields.sort_order ?? null)
      if (!changed) return { noop: true }
      setData((currentState) =>
        updateProductRow(currentState, productId, { ...fields, updated_at: new Date().toISOString() }),
      )
      return { noop: false }
    },

    async deleteProduct(id, input) {
      assertLocalLeader(profile)
      const product = data.products.find((item) => item.id === id)
      assertRecordExists(product)
      normalizeMasterReason(input.reason)
      assertLocalMasterCurrent(product, input.expectedUpdatedAt)
      if (data.productChangeTasks.some((task) => task.product_id === id)) {
        throw new UserFacingError('변경 적용 이력이 있는 제품은 삭제할 수 없습니다. 제품 이력을 유지해 주세요.')
      }
      setData((current) => removeProduct(current, id))
      return product.name
    },
  }
}
