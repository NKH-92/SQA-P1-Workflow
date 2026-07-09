import { useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * 파트장 전용 — review_requests INSERT를 Realtime으로 구독해 즉시 재조회를 트리거한다.
 * 행 가시성은 RLS(postgres_changes)가 구독자별로 강제하므로 권한 모델은 그대로다.
 * WebSocket이 끊기거나 사내망이 차단하면 조용히 죽고, 안전망 폴링(useBackgroundRefresh)이
 * 공백을 메운다 — 알림이 '즉시'에서 '수 분 내'로 강등될 뿐 기능은 유지된다.
 */
export function useRealtimeReviewInserts(enabled: boolean, onInsert: () => void) {
  const onInsertRef = useRef(onInsert)
  useEffect(() => {
    onInsertRef.current = onInsert
  })

  useEffect(() => {
    if (!enabled || !supabase) return
    let disconnected = false
    const channel = supabase
      .channel('review-requests-inserts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'review_requests' },
        () => onInsertRef.current(),
      )
      .subscribe((status) => {
        // 끊겼다가 복구되면 끊긴 동안 유실된 이벤트를 재조회 한 번으로 메운다.
        if (status === 'SUBSCRIBED' && disconnected) {
          disconnected = false
          onInsertRef.current()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          disconnected = true
        }
      })
    return () => {
      void supabase?.removeChannel(channel)
    }
  }, [enabled])
}
