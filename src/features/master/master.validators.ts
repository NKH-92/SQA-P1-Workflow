import { UserFacingError } from '../../lib/errors'
import type { AppData, ProductCategory, Role } from '../../types'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateInviteCreate(data: AppData, input: { email: string; name: string; role: Role }) {
  const email = input.email.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(email)) throw new UserFacingError('이메일 형식을 확인해 주세요.')
  if (!input.name.trim()) throw new UserFacingError('이름을 입력해 주세요.')
  if (data.allowedUsers.some((item) => item.email.toLowerCase() === email)) {
    throw new UserFacingError('이미 등록된 이메일이에요. 목록에서 계정을 확인해 주세요.')
  }
  return { email, name: input.name.trim(), role: input.role }
}

export function validateInviteUpdate(
  data: AppData,
  inviteId: string,
  input: { email: string; name: string; role: Role },
) {
  const email = input.email.trim().toLowerCase()
  if (!input.name.trim()) throw new UserFacingError('이름을 입력해 주세요.')
  if (!EMAIL_PATTERN.test(email)) throw new UserFacingError('이메일 형식을 확인해 주세요.')
  if (data.allowedUsers.some((item) => item.id !== inviteId && item.email.toLowerCase() === email)) {
    throw new UserFacingError('이미 등록된 이메일이에요. 목록에서 계정을 확인해 주세요.')
  }
  return { email, name: input.name.trim(), role: input.role }
}

export function validateProductCreate(
  data: AppData,
  input: { name: string; category: ProductCategory; companyName: string },
) {
  const name = input.name.trim()
  if (!name) throw new UserFacingError('제품명을 입력해 주세요.')
  if (data.products.some((item) => item.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new UserFacingError('이미 있는 제품명이에요. 다른 이름을 입력해 주세요.')
  }
  return {
    name,
    category: input.category,
    companyName: input.companyName.trim() || (input.category === '자사' ? '자사' : ''),
  }
}

export function validateProductUpdate(data: AppData, productId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new UserFacingError('제품명을 입력해 주세요.')
  if (data.products.some((item) => item.id !== productId && item.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    throw new UserFacingError('이미 있는 제품명이에요. 다른 이름을 입력해 주세요.')
  }
  return trimmed
}

export function validateMajorCategoryCreate(data: AppData, name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new UserFacingError('대분류명을 입력해 주세요.')
  if (data.dutyMajorCategories.some((item) => item.name.trim() === trimmed)) {
    throw new UserFacingError('이미 있는 대분류예요. 다른 이름을 입력해 주세요.')
  }
  return trimmed
}

export function validateMajorCategoryUpdate(data: AppData, majorCategoryId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new UserFacingError('대분류명을 입력해 주세요.')
  if (
    data.dutyMajorCategories.some((item) => item.id !== majorCategoryId && item.name.trim() === trimmed)
  ) {
    throw new UserFacingError('이미 있는 대분류예요. 다른 이름을 입력해 주세요.')
  }
  return trimmed
}

export function validateDutyCreate(data: AppData, input: { majorCategoryId: string; name: string }) {
  if (!input.majorCategoryId) throw new UserFacingError('대분류를 선택해 주세요.')
  const name = input.name.trim()
  if (!name) throw new UserFacingError('업무명을 입력해 주세요.')
  if (
    data.duties.some(
      (item) => item.major_category_id === input.majorCategoryId && item.name.trim() === name,
    )
  ) {
    throw new UserFacingError('같은 대분류에 이미 있는 업무명이에요. 다른 이름을 입력해 주세요.')
  }
  return { majorCategoryId: input.majorCategoryId, name }
}

export function validateDutyUpdate(
  data: AppData,
  dutyId: string,
  input: { majorCategoryId: string; name: string },
) {
  if (!input.majorCategoryId) throw new UserFacingError('대분류를 선택해 주세요.')
  const name = input.name.trim()
  if (!name) throw new UserFacingError('업무명을 입력해 주세요.')
  if (
    data.duties.some(
      (item) =>
        item.id !== dutyId &&
        item.major_category_id === input.majorCategoryId &&
        item.name.trim() === name,
    )
  ) {
    throw new UserFacingError('같은 대분류에 이미 있는 업무명이에요. 다른 이름을 입력해 주세요.')
  }
  return { majorCategoryId: input.majorCategoryId, name }
}

export function validateProductAssignment(data: AppData, userId: string, productId: string) {
  if (
    data.productAssignments.some(
      (assignment) => assignment.user_id === userId && assignment.product_id === productId,
    )
  ) {
    throw new UserFacingError('이미 이 파트원에게 배정한 제품이에요.')
  }
}

export function validateProductImport(data: AppData, rowCount: number, incomingCount: number) {
  if (rowCount === 0) throw new UserFacingError('CSV에 가져올 제품이 없어요. 파일 내용을 확인해 주세요.')
  if (incomingCount === 0) throw new UserFacingError('모두 이미 등록된 제품이에요. 새로 가져올 제품이 없어요.')
}

export function validateInviteImport(data: AppData, rowCount: number, incomingCount: number) {
  if (rowCount === 0) throw new UserFacingError('CSV에 가져올 계정이 없어요. 파일 내용을 확인해 주세요.')
  if (incomingCount === 0) throw new UserFacingError('새로 추가할 수 있는 계정이 없어요. 가져오기 결과를 확인해 주세요.')
}

export function validateProfileToggle(data: AppData, email: string) {
  const memberProfile = data.profiles.find((item) => item.email.toLowerCase() === email.toLowerCase())
  if (!memberProfile) {
    throw new UserFacingError(
      '아직 가입하지 않은 계정이에요. 처음 로그인한 뒤에 활성 상태를 바꿀 수 있어요.',
    )
  }
  return memberProfile
}
