import { UserFacingError } from '../../lib/errors'
import type { AppData, ProductCategory, Role } from '../../types'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateInviteCreate(data: AppData, input: { email: string; name: string; role: Role }) {
  const email = input.email.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(email)) throw new UserFacingError('올바른 이메일 형식을 입력해 주세요.')
  if (!input.name.trim()) throw new UserFacingError('이름을 입력해 주세요.')
  if (data.allowedUsers.some((item) => item.email.toLowerCase() === email)) {
    throw new UserFacingError('이미 초대 목록에 등록된 이메일입니다.')
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
  if (!EMAIL_PATTERN.test(email)) throw new UserFacingError('올바른 이메일 형식을 입력해 주세요.')
  if (data.allowedUsers.some((item) => item.id !== inviteId && item.email.toLowerCase() === email)) {
    throw new UserFacingError('이미 초대 목록에 등록된 이메일입니다.')
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
    throw new UserFacingError('이미 등록된 제품명입니다.')
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
    throw new UserFacingError('이미 등록된 제품명입니다.')
  }
  return trimmed
}

export function validateMajorCategoryCreate(data: AppData, name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new UserFacingError('대분류명을 입력해 주세요.')
  if (data.dutyMajorCategories.some((item) => item.name.trim() === trimmed)) {
    throw new UserFacingError('이미 등록된 대분류입니다.')
  }
  return trimmed
}

export function validateMajorCategoryUpdate(data: AppData, majorCategoryId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new UserFacingError('대분류명을 입력해 주세요.')
  if (
    data.dutyMajorCategories.some((item) => item.id !== majorCategoryId && item.name.trim() === trimmed)
  ) {
    throw new UserFacingError('이미 등록된 대분류입니다.')
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
    throw new UserFacingError('같은 대분류에 이미 등록된 업무명입니다.')
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
    throw new UserFacingError('같은 대분류에 이미 등록된 업무명입니다.')
  }
  return { majorCategoryId: input.majorCategoryId, name }
}

export function validateProductAssignment(data: AppData, userId: string, productId: string) {
  if (
    data.productAssignments.some(
      (assignment) => assignment.user_id === userId && assignment.product_id === productId,
    )
  ) {
    throw new UserFacingError('이미 해당 파트원에게 배정된 제품입니다.')
  }
}

export function validateProductImport(data: AppData, rowCount: number, incomingCount: number) {
  if (rowCount === 0) throw new UserFacingError('가져올 제품 데이터가 없습니다.')
  if (incomingCount === 0) throw new UserFacingError('이미 등록된 제품만 포함되어 있습니다.')
}

export function validateInviteImport(data: AppData, rowCount: number, incomingCount: number) {
  if (rowCount === 0) throw new UserFacingError('가져올 초대 데이터가 없습니다.')
  if (incomingCount === 0) throw new UserFacingError('유효한 신규 초대가 없습니다.')
}

export function validateProfileToggle(data: AppData, email: string) {
  const memberProfile = data.profiles.find((item) => item.email.toLowerCase() === email.toLowerCase())
  if (!memberProfile) {
    throw new UserFacingError(
      '아직 가입하지 않은 사용자입니다. Supabase에서 계정을 만든 뒤 비활성화할 수 있습니다.',
    )
  }
  return memberProfile
}
