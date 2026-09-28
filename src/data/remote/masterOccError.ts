import { UserFacingError } from '../../lib/errors'
import {
  ACCOUNT_ACTIVE_DELETE_MESSAGE,
  ACCOUNT_EMAIL_LOCKED_MESSAGE,
  ACCOUNT_LIST_ROW_REQUIRED_MESSAGE,
  LAST_ACTIVE_LEADER_MESSAGE,
  MASTER_REASON_REQUIRED_MESSAGE,
  MASTER_STALE_MESSAGE,
  SELF_DEACTIVATION_MESSAGE,
} from '../validation/masterOcc'

// 로컬 저장소도 같은 문구를 던지므로 상수는 validation 계층에 두고 여기서는 다시 내보낸다.
export { ACCOUNT_ACTIVE_DELETE_MESSAGE, ACCOUNT_EMAIL_LOCKED_MESSAGE, ACCOUNT_LIST_ROW_REQUIRED_MESSAGE }

/**
 * Translate the stable RPC error text raised by the `*_if_current`
 * master OCC functions (`supabase/migrations/20260720140000_master_occ_audit_reasons.sql`)
 * into the same user-facing messages the local preview adapter throws, so
 * local/remote error parity holds for the mutation layer above the
 * repository (see `masterOcc.remote.test.ts` / `masterOcc.localParity.test.ts`).
 */
export function translateMasterOccError<T extends { message?: string; details?: string }>(error: T): T | UserFacingError {
  const message = error.message ?? ''
  // 계정 목록 가드는 PostgREST details의 고정 코드로 구분한다(문구가 바뀌어도 코드는 유지된다).
  const details = error.details ?? ''
  // details가 빠져 와도 서버 문구로 알아본다.
  if (
    details.includes('SQA_ACCOUNT_ACTIVE')
    || message.includes('SQA_ACCOUNT_ACTIVE')
    || message.includes('active account must be deactivated before deletion')
  ) {
    return new UserFacingError(ACCOUNT_ACTIVE_DELETE_MESSAGE)
  }
  if (
    details.includes('SQA_ACCOUNT_EMAIL_LOCKED')
    || message.includes('SQA_ACCOUNT_EMAIL_LOCKED')
    || message.includes('linked account email cannot be changed')
  ) {
    return new UserFacingError(ACCOUNT_EMAIL_LOCKED_MESSAGE)
  }
  if (
    details.includes('SQA_ACCOUNT_LIST_ROW_REQUIRED')
    || message.includes('SQA_ACCOUNT_LIST_ROW_REQUIRED')
    || message.includes('account list row is required to activate')
  ) {
    return new UserFacingError(ACCOUNT_LIST_ROW_REQUIRED_MESSAGE)
  }
  if (message.includes('record changed since it was opened')) {
    return new UserFacingError(MASTER_STALE_MESSAGE)
  }
  if (message.includes('record not found')) {
    return new UserFacingError(MASTER_STALE_MESSAGE)
  }
  if (message.includes('change reason is required')) {
    return new UserFacingError(MASTER_REASON_REQUIRED_MESSAGE)
  }
  if (message.includes('change reason must be')) {
    const limit = /(\d+)/.exec(message)?.[1]
    return new UserFacingError(limit ? `변경 사유는 ${limit}자 이하로 입력해 주세요.` : '변경 사유를 조금 더 짧게 입력해 주세요.')
  }
  if (
    message.includes('cannot disable or demote the last active leader')
    || message.includes('cannot demote the last active leader')
  ) {
    return new UserFacingError(LAST_ACTIVE_LEADER_MESSAGE)
  }
  if (message.includes('cannot deactivate your own account')) {
    return new UserFacingError(SELF_DEACTIVATION_MESSAGE)
  }
  return error
}
