import { UserFacingError } from '../../lib/errors'

/**
 * Unified stale-write message for every important-master OCC
 * surface (product/duty/duty-major-category update, invite update, profile
 * active toggle, product/duty assignment replacement). Local and remote
 * repositories both throw this exact text so the UI never has to special-case
 * which entity or which adapter produced the conflict.
 */
export const MASTER_STALE_MESSAGE = '다른 사람이 먼저 수정했어요. 새로고침한 뒤 다시 시도해 주세요.'

export const MASTER_REASON_REQUIRED_MESSAGE = '변경 사유를 입력해 주세요.'

/** 마지막 활성 파트장을 비활성화하거나 역할을 낮추려 할 때(로컬·원격 공통). */
export const LAST_ACTIVE_LEADER_MESSAGE = '활성 파트장이 최소 한 명은 있어야 해요. 다른 파트장을 먼저 활성화해 주세요.'

export const SELF_DEACTIVATION_MESSAGE = '내 계정은 비활성화할 수 없어요. 다른 파트장에게 요청해 주세요.'

export const PRODUCT_HAS_CHANGE_HISTORY_MESSAGE = '변경 적용 이력이 있는 제품은 기록을 지키기 위해 삭제할 수 없어요.'

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
