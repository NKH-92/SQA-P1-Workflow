import { useEffect, useRef } from 'react'

/** 서버가 이 세션으로는 앱을 쓸 수 없다고 거부할 때 주는 코드(세션 폐기·비활성화·비밀번호 초기화). */
export const APP_ACCESS_REQUIRED_ERROR_CODE = 'SQA_APP_ACCESS_REQUIRED'

/**
 * 열려 있는 탭이 서버 쪽 세션 폐기·비활성화·비밀번호 초기화를 뒤늦게라도 알아채게 한다.
 * 동기화가 SQA_APP_ACCESS_REQUIRED로 실패하면 프로필을 한 번 다시 확인해, 이미 있는
 * 로그인 화면·비활성 안내·비밀번호 변경 화면으로 보낸다.
 * 같은 프로필에서는 한 번만 다시 확인한다(프로필은 멀쩡한데 부트스트랩만 거부되는 경우의 무한 재시도 방지).
 * 동기화가 성공하거나 다른 오류로 바뀌면 다시 확인할 수 있게 풀어 준다. 다른 프로필이 되면 그 프로필로 한 번 더 확인한다.
 * 재확인 도중 프로필이 잠시 비는 것(null)만으로는 풀지 않는다(같은 코드로 같은 프로필을 두 번 확인하지 않게).
 */
export function useSessionRevocationCheck(
  lastErrorCode: string | null | undefined,
  retryProfileLoad: () => void,
  profileId: string | null,
) {
  /** 이 코드로 이미 다시 확인한 프로필 id. */
  const checkedProfileIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (lastErrorCode !== APP_ACCESS_REQUIRED_ERROR_CODE) {
      checkedProfileIdRef.current = null
      return
    }
    if (!profileId || checkedProfileIdRef.current === profileId) return
    checkedProfileIdRef.current = profileId
    retryProfileLoad()
  }, [lastErrorCode, profileId, retryProfileLoad])
}
