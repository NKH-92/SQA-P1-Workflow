import { useEffect, useRef } from 'react'

const POLL_INTERVAL_MS = 5 * 60_000
/** 포커스·가시성 이벤트가 연달아 와도 재조회가 몰리지 않게 하는 최소 간격. */
const REFRESH_MIN_GAP_MS = 30_000
/** 실패 직후(절전 해제·VPN 재연결 등) 네트워크가 곧 살아나는 경우를 위한 1회 재시도 지연. */
const RETRY_AFTER_FAILURE_MS = 30_000

export type BackgroundRefreshOptions = {
  /**
   * 탭이 숨겨져 있어도 5분 폴링을 계속할지. 숨긴 탭에서 받은 데이터는 데스크톱 알림을 켠
   * 사용자에게만 쓰이므로, 그 외에는 건너뛰고 탭으로 돌아올 때 visibilitychange가 곧바로 재조회한다.
   */
  pollWhenHidden?: boolean
}

/**
 * 안전망 폴링 + 창 복귀 재조회. Realtime 구독이 주 채널이고, 이 훅은 WebSocket 끊김·차단
 * 환경에서의 공백을 메운다. 실패는 여기서 UI로 표면화하지 않는다 — 30초 뒤 한 번 더 시도하고,
 * 다음 창 복귀·'online'·주기가 다시 시도하며, 본 기능(수동 새로고침·뮤테이션 후 갱신)에는 영향이 없다.
 * 대신 `refresh`(useAppData의 refreshData)가 실패를 SyncHealth 상태로 기록하므로 관측성은 유지된다.
 */
export function useBackgroundRefresh(
  enabled: boolean,
  refresh: () => Promise<void>,
  options?: BackgroundRefreshOptions,
) {
  const refreshRef = useRef(refresh)
  const pollWhenHiddenRef = useRef(options?.pollWhenHidden ?? false)
  useEffect(() => {
    refreshRef.current = refresh
    pollWhenHiddenRef.current = options?.pollWhenHidden ?? false
  })
  const lastRunRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    let retryTimer: number | null = null
    let disposed = false
    const run = (isRetry = false) => {
      const now = Date.now()
      if (now - lastRunRef.current < REFRESH_MIN_GAP_MS) return
      lastRunRef.current = now
      // 새 시도가 나가면 예약된 재시도는 필요 없다(이 시도가 실패하면 다시 예약한다).
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
        retryTimer = null
      }
      refreshRef.current().catch(() => {
        // 그사이 더 새로운 시도가 나갔다면 그 시도가 결과를 맡는다.
        if (disposed || lastRunRef.current !== now) return
        // 실패하면 간격 제한을 풀어 다음 창 복귀·'online'이 곧바로 재시도하게 하고,
        // 30초 뒤 한 번만 더 시도한다. 재시도의 실패는 다시 예약하지 않는다(다음 주기·이벤트가 맡는다).
        lastRunRef.current = 0
        if (isRetry || retryTimer !== null) return
        retryTimer = window.setTimeout(() => {
          retryTimer = null
          run(true)
        }, RETRY_AFTER_FAILURE_MS)
      })
    }
    const onEvent = () => run()
    const onInterval = () => {
      // 숨긴 탭의 건너뛴 주기는 lastRunRef를 갱신하지 않아, 탭 복귀 때 곧바로 재조회된다.
      if (document.hidden && !pollWhenHiddenRef.current) return
      run()
    }
    const interval = window.setInterval(onInterval, POLL_INTERVAL_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') run()
    }
    window.addEventListener('focus', onEvent)
    window.addEventListener('online', onEvent)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      disposed = true
      window.clearInterval(interval)
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      window.removeEventListener('focus', onEvent)
      window.removeEventListener('online', onEvent)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [enabled])
}
