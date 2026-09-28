import { errorDetailText, UserFacingError } from '../../lib/errors'
import { CHANGE_APPLICATION_STALE_MESSAGE, CHANGE_CONTENT_LOCKED_MESSAGE } from '../validation/changeApplications'

const TASK_ALREADY_HANDLED_MESSAGE = '다른 사람이 이미 처리한 업무예요. 목록을 새로고침해 주세요.'
const APPLICATION_NOT_ACTIVE_MESSAGE = '이미 취소했거나 완료·보관한 공통변경이에요. 목록을 새로고침해 주세요.'

/**
 * 다른 사람이 먼저 상태를 바꿔 거절된 경우의 서버 코드(PostgREST details). 공통변경 상태 검사가
 * 업무 상태 검사보다 먼저 돌므로 'not pending' 문자열 검사 전에 본다.
 * 문구는 로컬 저장소(localChangeApplicationRepository)의 같은 상황 안내와 맞춘다.
 */
const CHANGE_STATE_MESSAGES: Array<[marker: string, message: string]> = [
  ['SQA_CHANGE_APPLICATION_NOT_ACTIVE', APPLICATION_NOT_ACTIVE_MESSAGE],
  ['SQA_CHANGE_APPLICATION_CANCELLED', APPLICATION_NOT_ACTIVE_MESSAGE],
  ['SQA_CHANGE_APPLICATION_ALREADY_FINAL', APPLICATION_NOT_ACTIVE_MESSAGE],
  ['SQA_CHANGE_APPLICATION_NOT_PUBLISHED', '아직 최종 완료할 수 없는 공통변경이에요.'],
  ['SQA_CHANGE_APPLICATION_NOT_FINAL', '아직 최종 완료하지 않은 공통변경이에요.'],
  ['SQA_CHANGE_APPLICATION_NOT_DRAFT', '배포한 공통변경은 초안으로 되돌릴 수 없어요.'],
  ['SQA_CHANGE_APPLICATION_NOT_FOUND', '공통변경을 찾지 못했어요. 목록을 새로고침해 주세요.'],
  ['SQA_CHANGE_FINAL_UNDO_REQUIRED', '완료 이력은 [완료 취소]로 다시 열 수 있어요.'],
  ['SQA_CHANGE_TASK_NOT_PENDING', TASK_ALREADY_HANDLED_MESSAGE],
  ['SQA_SCOPE_TASK_NOT_PENDING', TASK_ALREADY_HANDLED_MESSAGE],
  ['SQA_CHANGE_TASK_NOT_REOPENABLE', TASK_ALREADY_HANDLED_MESSAGE],
  ['SQA_CHANGE_TASK_NOT_REASSIGNABLE', '지금 상태에서는 담당자를 바꿀 수 없어요. 목록을 새로고침해 주세요.'],
  ['SQA_CHANGE_TASK_NOT_FOUND', '적용 업무를 찾지 못했어요. 목록을 새로고침해 주세요.'],
]

export function translateChangeApplicationError<T extends { message?: string; details?: string }>(error: T): T | UserFacingError {
  const message = `${error.message ?? ''} ${errorDetailText(error)}`
  if (message.includes('change_applications_change_number_key') || message.includes('duplicate key')) {
    return new UserFacingError('이미 등록된 변경번호예요. 기존 공통변경을 확인해 주세요.')
  }
  if (message.includes('locked after the first processed task')) {
    return new UserFacingError(CHANGE_CONTENT_LOCKED_MESSAGE)
  }
  if (message.includes('locked after processing started')) {
    return new UserFacingError('처리를 시작한 공통변경은 범위에 다시 넣을 수 없어요.')
  }
  if (message.includes('change application was modified by another user')) {
    return new UserFacingError(CHANGE_APPLICATION_STALE_MESSAGE)
  }
  const stateMessage = CHANGE_STATE_MESSAGES.find(([code]) => message.includes(code))?.[1]
  if (stateMessage) return new UserFacingError(stateMessage)
  // 범위 복원 경합만 번역한다. 초안 저장의 같은 코드('restored with a reason first')는 다른 뜻이라 그대로 둔다.
  if (message.includes('SQA_CHANGE_TASK_NOT_RESTORABLE') && !message.includes('restored with a reason first')) {
    return new UserFacingError('범위에서 뺀 제품만 다시 넣을 수 있어요.')
  }
  if (message.includes('not pending')) {
    return new UserFacingError(TASK_ALREADY_HANDLED_MESSAGE)
  }
  if (message.includes('has pending product tasks')) {
    return new UserFacingError('남은 적용 업무를 모두 처리하면 보관할 수 있어요.')
  }
  if (message.includes('has no product tasks')) {
    return new UserFacingError('적용 업무가 없는 공통변경은 보관할 수 없어요.')
  }
  if (message.includes('already archived')) return new UserFacingError('이미 보관한 공통변경이에요.')
  if (message.includes('is not archived')) return new UserFacingError('보관하지 않은 공통변경이에요.')
  if (message.includes('SQA_ACTIVE_LEADER_REQUIRED')) return new UserFacingError('파트장만 처리할 수 있어요.')
  if (message.includes('SQA_CHANGE_ACTIVE_ASSIGNEE_REQUIRED')) return new UserFacingError('모든 제품에 활성 담당자를 정해 주세요.')
  if (message.includes('SQA_CHANGE_PROXY_COMPLETION_FORBIDDEN')) return new UserFacingError('다른 사람의 업무는 대신 처리할 수 없어요. 담당자에게 요청해 주세요.')
  if (message.includes('SQA_CHANGE_ASSIGNEE_REQUIRED')) return new UserFacingError('이 업무의 담당자만 처리할 수 있어요.')
  if (message.includes('SQA_CHANGE_NOT_APPLICABLE_REASON_REQUIRED')) return new UserFacingError('해당 없음 사유를 입력해 주세요.')
  if (message.includes('SQA_CHANGE_FINAL_NOTE_REQUIRED')) return new UserFacingError('해당 없음이나 범위 제외가 있으면 최종 확인 메모를 적어 주세요.')
  if (message.includes('SQA_CHANGE_PENDING_TASKS')) return new UserFacingError('아직 처리하지 않은 제품이 있어요. 모두 처리한 뒤 완료해 주세요.')
  if (message.includes('SQA_CHANGE_APPLICATION_CONFLICT')) return new UserFacingError(CHANGE_APPLICATION_STALE_MESSAGE)
  if (message.includes('SQA_CHANGE_REOPEN_TASKS_INVALID')) return new UserFacingError('다시 열 제품과 담당자를 확인해 주세요.')
  if (message.includes('SQA_CHANGE_UNDO_REASON_REQUIRED')) return new UserFacingError('완료 취소 사유를 입력해 주세요.')
  return error
}
