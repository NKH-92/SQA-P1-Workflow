import type { AppData } from '../../types'
import { UserFacingError } from '../../lib/errors'
import { assertMasterVersion, normalizeMasterReason } from './masterOcc'

export const PRODUCT_DUTY_LABEL = '제품 담당자'
export const ROTATION_DUTY_LABEL = '순차 배정'

export type DutyAllocationInput = {
  name: string
  majorCategoryId: string
  notes: string | null
  /** Null keeps both the original label and assignments on an edit. */
  assignment: { label: string | null; memberIds: string[] } | null
  edit?: { id: string; expectedUpdatedAt: string | null; reason: string }
}

export function normalizeDutyAllocation(data: AppData, input: DutyAllocationInput): DutyAllocationInput {
  const name = input.name.trim()
  if (!data.dutyMajorCategories.some((category) => category.id === input.majorCategoryId)) {
    throw new UserFacingError('대분류를 선택해 주세요.')
  }
  if (!name || Array.from(name).length > 200) throw new UserFacingError('업무명을 1~200자로 입력해 주세요.')
  if (data.duties.some((duty) => duty.id !== input.edit?.id
    && duty.major_category_id === input.majorCategoryId && duty.name.trim() === name)) {
    throw new UserFacingError('같은 대분류에 이미 있는 업무명이에요. 다른 이름을 입력해 주세요.')
  }
  const assignment = input.assignment && {
    label: input.assignment.label?.trim() || null,
    memberIds: [...new Set(input.assignment.memberIds)].sort(),
  }
  if (assignment?.label && assignment.memberIds.length > 0) {
    throw new UserFacingError('담당 표기와 파트원 지정 중 하나를 선택해 주세요.')
  }
  return {
    ...input,
    name,
    notes: input.notes?.trim() || null,
    assignment,
    edit: input.edit && {
      ...input.edit,
      expectedUpdatedAt: assertMasterVersion(input.edit.expectedUpdatedAt),
      reason: normalizeMasterReason(input.edit.reason),
    },
  }
}
