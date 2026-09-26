import { UserFacingError } from '../../lib/errors'
import {
  LAST_ACTIVE_LEADER_MESSAGE,
  MASTER_REASON_REQUIRED_MESSAGE,
  MASTER_STALE_MESSAGE,
  SELF_DEACTIVATION_MESSAGE,
} from '../validation/masterOcc'

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
