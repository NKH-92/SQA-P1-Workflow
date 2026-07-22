import { UserFacingError } from '../../lib/errors'

/**
 * Unified stale-write message for every important-master OCC
 * surface (product/duty/duty-major-category update, invite update, profile
 * active toggle, product/duty assignment replacement). Local and remote
 * repositories both throw this exact text so the UI never has to special-case
 * which entity or which adapter produced the conflict.
 */
export const MASTER_STALE_MESSAGE = '다른 사용자가 변경했습니다. 새로고침 후 다시 시도해 주세요.'

export const MASTER_REASON_REQUIRED_MESSAGE = '변경 사유를 입력해 주세요.'

export const MASTER_REASON_MAX_LENGTH = 500

export function normalizeMasterReason(reason: string | null | undefined): string {
  const trimmed = (reason ?? '').trim()
  if (!trimmed) throw new UserFacingError(MASTER_REASON_REQUIRED_MESSAGE)
  if (trimmed.length > MASTER_REASON_MAX_LENGTH) {
    throw new UserFacingError(`변경 사유는 ${MASTER_REASON_MAX_LENGTH}자 이하로 입력해 주세요.`)
  }
  return trimmed
}

export function assertMasterVersion(expectedUpdatedAt: string | null | undefined): string {
  if (!expectedUpdatedAt) throw new UserFacingError(MASTER_STALE_MESSAGE)
  return expectedUpdatedAt
}

/** Correlates a mutation's RPC call with the private authoritative audit row it writes. */
export function makeMasterCorrelationId(): string {
  return crypto.randomUUID()
}
