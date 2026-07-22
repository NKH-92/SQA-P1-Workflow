import { canReceiveAssignment } from '../../domain/permissions'
import { assertRecordExists, UserFacingError } from '../../lib/errors'
import { makeId } from '../../lib/format'
import type { DutyMajorCategory } from '../../types'
import type { DutyAdminRepository, RepositoryDeps } from '../repositories/types'
import { normalizeMasterReason } from '../validation/masterOcc'
import {
  appendDutyAssignment,
  removeDuty,
  removeDutyMajorCategory,
  replaceDutyAssignments,
} from './appDataReducers'
import {
  assertLocalAssignmentMembers,
  assertLocalLeader,
  assertLocalMasterCurrent,
} from './localAdminGuards'

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

export function createLocalDutyAdminRepository(deps: RepositoryDeps): DutyAdminRepository {
  const { profile, data, setData } = deps

  return {
    async addDutyMajorCategory(payload) {
      assertLocalLeader(profile)
      const now = new Date().toISOString()
      setData((current) => ({
        ...current,
        dutyMajorCategories: [{ id: makeId('duty-major'), ...payload, created_at: now, updated_at: now }, ...current.dutyMajorCategories],
      }))
    },

    async addDuty(payload) {
      assertLocalLeader(profile)
      const now = new Date().toISOString()
      const majorCategory = data.dutyMajorCategories.find((item) => item.id === payload.major_category_id)
      setData((current) => ({
        ...current,
        duties: [
          {
            id: makeId('duty'),
            ...payload,
            created_at: now,
            updated_at: now,
            duty_major_categories: majorCategory
              ? { name: majorCategory.name, sort_order: majorCategory.sort_order ?? null }
              : null,
          },
          ...current.duties,
        ],
      }))
    },

    async saveDutyAssignments({ dutyId, nextMemberIds, reason, duty, memberOptions, expectedUpdatedAt }) {
      assertLocalLeader(profile)
      normalizeMasterReason(reason)
      assertLocalAssignmentMembers(data, nextMemberIds)
      const resolvedDuty = duty ?? data.duties.find((item) => item.id === dutyId) ?? null
      assertRecordExists(resolvedDuty)
      const currentDuty = data.duties.find((item) => item.id === dutyId)
      assertRecordExists(currentDuty)
      assertLocalMasterCurrent(
        currentDuty,
        expectedUpdatedAt ?? currentDuty.updated_at,
      )
      const nextIds = [...new Set(nextMemberIds)].sort()
      const existingIds = data.dutyAssignments
        .filter((assignment) => assignment.duty_id === dutyId)
        .map((assignment) => assignment.user_id)
        .sort()
      if (nextIds.length === existingIds.length && nextIds.every((id, index) => id === existingIds[index])) {
        return { noop: true }
      }
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
      return { noop: false }
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

    async updateDutyMajorCategory(majorCategoryId, payload) {
      assertLocalLeader(profile)
      const current = data.dutyMajorCategories.find((item) => item.id === majorCategoryId)
      assertRecordExists(current)
      normalizeMasterReason(payload.reason)
      assertLocalMasterCurrent(current, payload.expectedUpdatedAt)
      const changed =
        current.name !== payload.name || (current.sort_order ?? null) !== (payload.sort_order ?? null)
      if (!changed) return { noop: true }
      const now = new Date().toISOString()
      setData((currentState) => ({
        ...currentState,
        dutyMajorCategories: currentState.dutyMajorCategories.map((item) =>
          item.id === majorCategoryId
            ? { ...item, name: payload.name, sort_order: payload.sort_order ?? null, updated_at: now }
            : item,
        ),
        duties: currentState.duties.map((item) =>
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
        dutyAssignments: currentState.dutyAssignments.map((assignment) =>
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
      return { noop: false }
    },

    async updateDuty(dutyId, payload) {
      assertLocalLeader(profile)
      const current = data.duties.find((item) => item.id === dutyId)
      assertRecordExists(current)
      normalizeMasterReason(payload.reason)
      assertLocalMasterCurrent(current, payload.expectedUpdatedAt)
      const majorCategory = data.dutyMajorCategories.find((item) => item.id === payload.major_category_id)
      const nextAssigneeLabel = payload.assignee_label ?? null
      const nextNotes = payload.notes ?? null
      const changed =
        current.name !== payload.name
        || current.major_category_id !== payload.major_category_id
        || (current.sort_order ?? null) !== (payload.sort_order ?? null)
        || (current.assignee_label ?? null) !== nextAssigneeLabel
        || (current.notes ?? null) !== nextNotes
      if (!changed) return { noop: true }
      const now = new Date().toISOString()
      setData((currentState) => ({
        ...currentState,
        duties: currentState.duties.map((item) =>
          item.id === dutyId
            ? {
                ...item,
                name: payload.name,
                major_category_id: payload.major_category_id,
                sort_order: payload.sort_order ?? null,
                assignee_label: nextAssigneeLabel,
                notes: nextNotes,
                updated_at: now,
                duty_major_categories: majorCategory
                  ? { name: majorCategory.name, sort_order: majorCategory.sort_order ?? null }
                  : item.duty_major_categories,
              }
            : item,
        ),
        dutyAssignments: currentState.dutyAssignments.map((assignment) =>
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
      return { noop: false }
    },

    async deleteDuty(id, input) {
      assertLocalLeader(profile)
      const duty = data.duties.find((item) => item.id === id)
      assertRecordExists(duty)
      normalizeMasterReason(input.reason)
      assertLocalMasterCurrent(duty, input.expectedUpdatedAt)
      setData((current) => removeDuty(current, id))
      return duty.name
    },

    async deleteDutyMajorCategory(id, input) {
      assertLocalLeader(profile)
      const category = data.dutyMajorCategories.find((item) => item.id === id)
      assertRecordExists(category)
      normalizeMasterReason(input.reason)
      assertLocalMasterCurrent(category, input.expectedUpdatedAt)
      if (data.duties.some((item) => item.major_category_id === id)) {
        throw new UserFacingError('소속된 업무가 있어 대분류를 삭제할 수 없습니다. 먼저 업무를 이동하거나 삭제하세요.')
      }
      setData((current) => removeDutyMajorCategory(current, id))
      return category.name
    },
  }
}
