import { UserFacingError } from '../../lib/errors'
import { MASTER_REASON_REQUIRED_MESSAGE, MASTER_STALE_MESSAGE } from '../validation/masterOcc'

/**
 * Translate the stable RPC error text raised by the `*_if_current`
 * master OCC functions (`supabase/migrations/20260720140000_master_occ_audit_reasons.sql`)
 * into the same user-facing messages the local preview adapter throws, so
 * local/remote error parity holds for the mutation layer above the
 * repository (see `masterOcc.remote.test.ts` / `masterOcc.localParity.test.ts`).
 */
export function translateMasterOccError<T extends { message?: string }>(error: T): T | UserFacingError {
  const message = error.message ?? ''
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
    return new UserFacingError(message.replace('change reason must be', '변경 사유는').replace('characters or fewer', '자 이하로 입력해 주세요.'))
  }
  if (
    message.includes('cannot disable or demote the last active leader')
    || message.includes('cannot demote the last active leader')
  ) {
    return new UserFacingError('활성 파트장은 최소 한 명 이상 유지해야 합니다.')
  }
  if (message.includes('cannot deactivate your own account')) {
    return new UserFacingError('본인 계정은 비활성화할 수 없습니다.')
  }
  return error
}
