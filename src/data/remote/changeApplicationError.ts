import { UserFacingError } from '../../lib/errors'
import { CHANGE_APPLICATION_STALE_MESSAGE } from '../validation/changeApplications'

export function translateChangeApplicationError<T extends { message?: string; details?: string }>(error: T): T | UserFacingError {
  const message = `${error.message ?? ''} ${error.details ?? ''}`
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
  if (message.includes('SQA_ACTIVE_LEADER_REQUIRED')) return new UserFacingError('활성 파트장만 처리할 수 있습니다.')
  if (message.includes('SQA_CHANGE_ACTIVE_ASSIGNEE_REQUIRED')) return new UserFacingError('모든 제품에 활성 책임자를 지정해 주세요.')
  if (message.includes('SQA_CHANGE_PROXY_COMPLETION_FORBIDDEN')) return new UserFacingError('대리 처리는 허용되지 않습니다.')
  if (message.includes('SQA_CHANGE_ASSIGNEE_REQUIRED')) return new UserFacingError('지정된 담당자만 이 업무를 처리할 수 있습니다.')
  if (message.includes('SQA_CHANGE_NOT_APPLICABLE_REASON_REQUIRED')) return new UserFacingError('해당 없음 사유를 입력해 주세요.')
  if (message.includes('SQA_CHANGE_FINAL_NOTE_REQUIRED')) return new UserFacingError('예외가 있는 경우 최종 확인 메모가 필요합니다.')
  if (message.includes('SQA_CHANGE_PENDING_TASKS')) return new UserFacingError('아직 처리하지 않은 제품이 남아 있습니다.')
  if (message.includes('SQA_CHANGE_APPLICATION_CONFLICT')) return new UserFacingError(CHANGE_APPLICATION_STALE_MESSAGE)
  if (message.includes('SQA_CHANGE_REOPEN_TASKS_INVALID')) return new UserFacingError('재개할 제품과 새 책임자를 확인해 주세요.')
  if (message.includes('SQA_CHANGE_UNDO_REASON_REQUIRED')) return new UserFacingError('완료 취소 사유를 입력해 주세요.')
  return error
}
