import { useEffect, useRef } from 'react'
import { fetchMemberPresence, fetchOfficeMeeting } from '../../data'
import type { AppDataUpdater } from '../../data/repositories/appDataUpdater'
import { supabase } from '../../lib/supabase'
import type { AppData, MemberPresence, OfficeMeeting } from '../../types'

type LiveSlice = 'meeting' | 'presence'

/** 실시간 연결이 막혀도 회의 요청·자리 상태가 이 안에 뜨도록 화면이 보일 때만 짧게 다시 확인한다. */
const LIVE_POLL_MS = 30_000

function fetchSlice(slice: LiveSlice): Promise<OfficeMeeting | MemberPresence | null> {
  return slice === 'meeting' ? fetchOfficeMeeting() : fetchMemberPresence()
}

/** 값이 그대로면 같은 객체를 돌려줘 React가 다시 그리지 않게 한다(30초 확인은 대부분 바뀐 게 없다). */
function sameValue(left: unknown, right: unknown) {
  return left === right || JSON.stringify(left) === JSON.stringify(right)
}

function applySlice(current: AppData, slice: LiveSlice, value: OfficeMeeting | MemberPresence | null | undefined): AppData {
  if (value === undefined) return current
  if (slice === 'meeting') {
    const meeting = value as OfficeMeeting | null
    return sameValue(current.officeMeeting, meeting) ? current : { ...current, officeMeeting: meeting }
  }
  // 자리 상태를 읽을 수 없으면(null) 지금 표시를 그대로 둔다.
  const presence = value as MemberPresence | null
  if (!presence || sameValue(current.memberPresence, presence)) return current
  return { ...current, memberPresence: presence }
}

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
    const inFlight: Record<LiveSlice, boolean> = { meeting: false, presence: false }
    // 읽는 중에 온 변화는 버리지 않고 표시해 두었다가, 끝난 뒤 한 번 더 읽는다(늦게 확정된 변화를 놓치지 않게).
    const pending: Record<LiveSlice, boolean> = { meeting: false, presence: false }

    const reload = (slices: LiveSlice[]) => {
      if (cancelled) return
      const due = slices.filter((slice) => {
        if (inFlight[slice]) pending[slice] = true
        return !inFlight[slice]
      })
      if (due.length === 0) return
      for (const slice of due) inFlight[slice] = true
      // 한 번에 읽은 결과는 한 번에 반영해 화면을 두 번 다시 그리지 않는다. 한쪽이 실패해도 다른 쪽은 반영하고,
      // 실패한 쪽은 다음 확인이나 전체 동기화가 맞춘다.
      Promise.all(due.map((slice) => fetchSlice(slice).catch(() => undefined)))
        .then((results) => {
          if (cancelled) return
          setDataRef.current((current) => {
            let next = current
            due.forEach((slice, index) => {
              next = applySlice(next, slice, results[index])
            })
            return next
          })
        })
        .finally(() => {
          for (const slice of due) inFlight[slice] = false
          const again = due.filter((slice) => pending[slice])
          for (const slice of again) pending[slice] = false
          if (again.length > 0 && !cancelled) reload(again)
        })
    }
    const reloadMeeting = () => reload(['meeting'])
    const reloadPresence = () => reload(['presence'])
    const reloadAll = () => reload(['meeting', 'presence'])

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
