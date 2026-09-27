import { useEffect, useRef } from 'react'
import { fetchMemberPresence, fetchOfficeMeeting } from '../../data'
import type { AppDataUpdater } from '../../data/repositories/appDataUpdater'
import { supabase } from '../../lib/supabase'

/** 실시간 연결이 막혀도 회의 요청·자리 상태가 이 안에 뜨도록 화면이 보일 때만 짧게 다시 확인한다. */
const LIVE_POLL_MS = 30_000

/**
 * 사무실 회의실(인스턴트 회의)과 자리 상태(잠깐 비움·휴가·출장)를 모든 사람 화면에 바로 맞춘다.
 * - Realtime: 회의 두 테이블이 바뀌면 회의실만, 상태 두 테이블이 바뀌면 상태만 다시 읽는다(행 가시성은 RLS가 막는다).
 * - 30초 확인: 사내망이 웹소켓을 막아도 늦지 않게 한다. 탭이 가려져 있으면 쉬고, 돌아오면 바로 확인한다.
 */
export function useOfficeLiveSync(enabled: boolean, setData: AppDataUpdater) {
  const setDataRef = useRef(setData)
  useEffect(() => {
    setDataRef.current = setData
  })

  useEffect(() => {
    if (!enabled || !supabase) return
    let cancelled = false
    const inFlight = { meeting: false, presence: false }

    const reloadMeeting = () => {
      if (inFlight.meeting || cancelled) return
      inFlight.meeting = true
      fetchOfficeMeeting()
        .then((meeting) => {
          if (!cancelled) setDataRef.current((current) => ({ ...current, officeMeeting: meeting }))
        })
        .catch(() => {
          // 다음 확인이나 전체 동기화가 맞춘다.
        })
        .finally(() => {
          inFlight.meeting = false
        })
    }
    const reloadPresence = () => {
      if (inFlight.presence || cancelled) return
      inFlight.presence = true
      fetchMemberPresence()
        .then((presence) => {
          if (!cancelled && presence) setDataRef.current((current) => ({ ...current, memberPresence: presence }))
        })
        .catch(() => {
          // 다음 확인이나 전체 동기화가 맞춘다.
        })
        .finally(() => {
          inFlight.presence = false
        })
    }
    const reloadAll = () => {
      reloadMeeting()
      reloadPresence()
    }

    let disconnected = false
    const channel = supabase
      .channel('office-live-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'office_meetings' }, reloadMeeting)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'office_meeting_participants' }, reloadMeeting)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_statuses' }, reloadPresence)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_leaves' }, reloadPresence)
      .subscribe((status) => {
        // 끊겼다가 복구되면 끊긴 동안 놓친 변화를 한 번에 맞춘다.
        if (status === 'SUBSCRIBED' && disconnected) {
          disconnected = false
          reloadAll()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          disconnected = true
        }
      })

    const poll = window.setInterval(() => {
      if (!document.hidden) reloadAll()
    }, LIVE_POLL_MS)
    const onVisibility = () => {
      if (!document.hidden) reloadAll()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisibility)
      void supabase?.removeChannel(channel)
    }
  }, [enabled])
}
