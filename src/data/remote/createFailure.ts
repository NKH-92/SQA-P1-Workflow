import { isAbortError, isNetworkError, UserFacingError } from '../../lib/errors'

/**
 * 새로 만드는 요청이 응답을 받기 전에 연결이 끊긴 경우의 안내.
 * 서버에는 이미 저장됐을 수 있으므로, 같은 내용을 바로 다시 보내 중복이 생기지 않게 목록부터 확인하게 한다.
 */
export const POSSIBLY_SAVED_MESSAGE = '저장됐을 수 있어요. 목록에 방금 쓴 내용이 있는지 먼저 확인한 뒤 다시 보내 주세요.'

/**
 * 새로 만들기(create) 경로 전용: 네트워크 오류나 시간 초과(AbortError)면 ‘저장됐을 수 있어요’ 안내로 바꿔 던진다.
 * 시간 초과로 끊겨도 서버에는 이미 저장됐을 수 있기 때문이다.
 * 다른 오류는 그대로 두므로 호출한 쪽이 원래 방식대로 처리한다.
 */
export function throwIfPossiblySaved(error: unknown): void {
  if (isNetworkError(error) || isAbortError(error)) throw new UserFacingError(POSSIBLY_SAVED_MESSAGE)
}
