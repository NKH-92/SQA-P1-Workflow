import { UserFacingError } from '../../../lib/errors'
import { MASTER_STALE_MESSAGE } from '../../../data/validation/masterOcc'

/**
 * 인라인 수정 저장이 버전 충돌(다른 사람이 먼저 수정)로 실패했는지 본다.
 * 수정을 연 시점의 버전으로는 다시 저장해도 같은 충돌이 나므로, 호출부는 편집을 닫아
 * 다시 열 때 최신 버전을 받게 한다. 최신 버전으로 자동 재시도하지 않는다(남의 수정을 덮어쓰지 않게).
 */
export function isMasterStaleError(error: unknown): boolean {
  return error instanceof UserFacingError && error.message === MASTER_STALE_MESSAGE
}
