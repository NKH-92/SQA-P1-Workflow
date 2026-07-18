import { UserFacingError } from '../../lib/errors'
import { CHANGE_APPLICATION_STALE_MESSAGE } from '../validation/changeApplications'

export function translateChangeApplicationError<T extends { message?: string }>(error: T): T | UserFacingError {
  const message = error.message ?? ''
  if (message.includes('change_applications_change_number_key') || message.includes('duplicate key')) {
    return new UserFacingError('이미 등록된 변경번호입니다. 기존 변경건을 확인해 주세요.')
  }
  if (message.includes('locked after the first processed task')) {
    return new UserFacingError('한 제품이라도 처리된 뒤에는 변경 내용을 수정할 수 없습니다.')
  }
  if (message.includes('change application was modified by another user')) {
    return new UserFacingError(CHANGE_APPLICATION_STALE_MESSAGE)
  }
  if (message.includes('not pending')) {
    return new UserFacingError('이미 다른 사용자가 처리한 업무입니다. 목록을 새로고침해 주세요.')
  }
  if (message.includes('has pending product tasks')) {
    return new UserFacingError('미완료 제품 업무가 남아 있어 보관할 수 없습니다.')
  }
  if (message.includes('has no product tasks')) {
    return new UserFacingError('제품 적용업무가 없는 변경건은 보관할 수 없습니다.')
  }
  if (message.includes('already archived')) return new UserFacingError('이미 보관된 변경건입니다.')
  if (message.includes('is not archived')) return new UserFacingError('보관되지 않은 변경건입니다.')
  return error
}
