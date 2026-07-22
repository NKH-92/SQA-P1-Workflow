import { useEffect, useRef } from 'react'

const POLL_INTERVAL_MS = 5 * 60_000
/** 포커스·가시성 이벤트가 연달아 와도 재조회가 몰리지 않게 하는 최소 간격. */
const REFRESH_MIN_GAP_MS = 30_000

/**
 * 안전망 폴링 + 창 복귀 재조회. Realtime 구독이 주 채널이고, 이 훅은 WebSocket 끊김·차단
 * 환경에서의 공백을 메운다. 실패는 여기서 UI로 표면화하지 않는다 — 다음 주기가 재시도하며,
 * 본 기능(수동 새로고침·뮤테이션 후 갱신)에는 영향이 없다. 대신 `refresh`(useAppData의
 * refreshData)가 실패를 SyncHealth 상태로 기록하므로 관측성은 유지된다. 이 훅의
 * `.catch(() => {})`는 그 이후 unhandled rejection을 막는 역할만 한다.
 */
export function useBackgroundRefresh(enabled: boolean, refresh: () => Promise<void>) {
  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  })
  const lastRunRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const run = () => {
      const now = Date.now()
      if (now - lastRunRef.current < REFRESH_MIN_GAP_MS) return
      lastRunRef.current = now
      refreshRef.current().catch(() => {})
    }
    const interval = window.setInterval(run, POLL_INTERVAL_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') run()
    }
    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [enabled])
}
