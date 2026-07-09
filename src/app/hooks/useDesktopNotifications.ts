import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppData } from '../../types'
import type { TabId } from '../types'
import {
  initialNotifiedUpTo,
  loadDesktopNotificationSettings,
  saveDesktopNotificationSettings,
  selectNewPendingReviews,
  showPendingReviewNotification,
} from '../../lib/desktopNotifications'

export type DesktopNotificationControls = {
  supported: boolean
  enabled: boolean
  permission: NotificationPermission | null
  toggle: () => Promise<void>
}

/**
 * 파트장 전용 크롬(브라우저) 알림. 데이터가 갱신될 때마다 기준선 이후의 새 대기
 * 검토요청을 찾아 데스크톱 알림을 띄운다. 트리거가 폴링이든 Realtime이든 동일하게
 * 동작한다 — 이 훅은 data 변화만 본다.
 */
export function useDesktopNotifications(
  profileId: string | null,
  leaderMode: boolean,
  data: AppData,
  setActiveTab: (tab: TabId, entityId?: string) => void,
): DesktopNotificationControls {
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const [enabled, setEnabled] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | null>(
    supported ? Notification.permission : null,
  )
  const notifiedUpToRef = useRef<string | null>(null)
  const notifiedIdsRef = useRef<Set<string>>(new Set())
  const setActiveTabRef = useRef(setActiveTab)
  useEffect(() => {
    setActiveTabRef.current = setActiveTab
  })

  useEffect(() => {
    if (!profileId) return
    const settings = loadDesktopNotificationSettings(profileId)
    setEnabled(settings.enabled && supported)
    notifiedUpToRef.current = settings.notifiedUpToIso
    notifiedIdsRef.current = new Set()
  }, [profileId, supported])

  useEffect(() => {
    if (!profileId || !leaderMode || !enabled || !supported) return
    if (Notification.permission !== 'granted') return
    if (!notifiedUpToRef.current) {
      // 켜진 채 시작한 세션의 첫 데이터 관찰 — 여기 이전 것은 알리지 않는다.
      notifiedUpToRef.current = initialNotifiedUpTo(data)
      saveDesktopNotificationSettings(profileId, { enabled: true, notifiedUpToIso: notifiedUpToRef.current })
      return
    }
    const fresh = selectNewPendingReviews(data, notifiedUpToRef.current, notifiedIdsRef.current)
    if (fresh.length === 0) return
    fresh.forEach((alert) => notifiedIdsRef.current.add(alert.id))
    notifiedUpToRef.current = new Date(fresh[fresh.length - 1].at).toISOString()
    saveDesktopNotificationSettings(profileId, { enabled: true, notifiedUpToIso: notifiedUpToRef.current })
    // 앱을 보고 있는 중엔 벨 뱃지로 충분하다 — 창이 뒤에 있을 때만 띄운다.
    if (document.hasFocus()) return
    fresh.forEach((alert) => {
      showPendingReviewNotification(alert, () => {
        window.focus()
        setActiveTabRef.current('reviews', alert.id)
      })
    })
  }, [data, enabled, leaderMode, profileId, supported])

  const toggle = useCallback(async () => {
    if (!profileId || !supported) return
    if (enabled) {
      setEnabled(false)
      saveDesktopNotificationSettings(profileId, { enabled: false, notifiedUpToIso: notifiedUpToRef.current })
      return
    }
    const nextPermission =
      Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    setPermission(nextPermission)
    if (nextPermission !== 'granted') return
    // 켜는 시점 이전의 대기 건은 알리지 않는다.
    notifiedUpToRef.current = initialNotifiedUpTo(data)
    setEnabled(true)
    saveDesktopNotificationSettings(profileId, { enabled: true, notifiedUpToIso: notifiedUpToRef.current })
  }, [data, enabled, profileId, supported])

  return { supported, enabled, permission, toggle }
}
