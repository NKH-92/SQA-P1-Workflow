import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppData } from '../../types'
import type { TabId } from '../types'
import {
  DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION,
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
  /** 알림 title에서 requester 이름을 숨긴다. 기본값 false(기존 동작 유지) — opt-in 강화. */
  hideRequesterName: boolean
  toggleHideRequesterName: () => void
  /** 알림 body에 검토 제목을 노출한다. 기본값 false — 잠금화면 노출을 줄이는 안전 기본값. */
  revealReviewTitle: boolean
  toggleRevealReviewTitle: () => void
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
  const [hideRequesterName, setHideRequesterName] = useState(false)
  const [revealReviewTitle, setRevealReviewTitle] = useState(false)
  const notifiedUpToRef = useRef<string | null>(null)
  const notifiedIdsRef = useRef<Set<string>>(new Set())
  const hideRequesterNameRef = useRef(false)
  const revealReviewTitleRef = useRef(false)
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
    hideRequesterNameRef.current = settings.hideRequesterName
    setHideRequesterName(settings.hideRequesterName)
    revealReviewTitleRef.current = settings.revealReviewTitle
    setRevealReviewTitle(settings.revealReviewTitle)
  }, [profileId, supported])

  useEffect(() => {
    if (!profileId || !leaderMode || !enabled || !supported) return
    if (Notification.permission !== 'granted') return
    if (!notifiedUpToRef.current) {
      // 켜진 채 시작한 세션의 첫 데이터 관찰 — 여기 이전 것은 알리지 않는다.
      notifiedUpToRef.current = initialNotifiedUpTo(data)
      saveDesktopNotificationSettings(profileId, {
        schemaVersion: DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION,
        enabled: true,
        notifiedUpToIso: notifiedUpToRef.current,
        hideRequesterName: hideRequesterNameRef.current,
        revealReviewTitle: revealReviewTitleRef.current,
      })
      return
    }
    const fresh = selectNewPendingReviews(data, notifiedUpToRef.current, notifiedIdsRef.current)
    if (fresh.length === 0) return
    fresh.forEach((alert) => notifiedIdsRef.current.add(alert.notificationKey))
    notifiedUpToRef.current = new Date(fresh[fresh.length - 1].at).toISOString()
    saveDesktopNotificationSettings(profileId, {
      schemaVersion: DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION,
      enabled: true,
      notifiedUpToIso: notifiedUpToRef.current,
      hideRequesterName: hideRequesterNameRef.current,
      revealReviewTitle: revealReviewTitleRef.current,
    })
    // 앱을 보고 있는 중엔 벨 뱃지로 충분하다 — 창이 뒤에 있을 때만 띄운다.
    if (document.hasFocus()) return
    const prefs = {
      hideRequesterName: hideRequesterNameRef.current,
      revealReviewTitle: revealReviewTitleRef.current,
    }
    fresh.forEach((alert) => {
      showPendingReviewNotification(alert, prefs, () => {
        window.focus()
        setActiveTabRef.current('reviews', alert.id)
      })
    })
  }, [data, enabled, leaderMode, profileId, supported])

  const toggle = useCallback(async () => {
    if (!profileId || !supported) return
    if (enabled) {
      setEnabled(false)
      saveDesktopNotificationSettings(profileId, {
        schemaVersion: DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION,
        enabled: false,
        notifiedUpToIso: notifiedUpToRef.current,
        hideRequesterName: hideRequesterNameRef.current,
        revealReviewTitle: revealReviewTitleRef.current,
      })
      return
    }
    const nextPermission =
      Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    setPermission(nextPermission)
    if (nextPermission !== 'granted') return
    // 켜는 시점 이전의 대기 건은 알리지 않는다.
    notifiedUpToRef.current = initialNotifiedUpTo(data)
    setEnabled(true)
    saveDesktopNotificationSettings(profileId, {
      schemaVersion: DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION,
      enabled: true,
      notifiedUpToIso: notifiedUpToRef.current,
      hideRequesterName: hideRequesterNameRef.current,
      revealReviewTitle: revealReviewTitleRef.current,
    })
  }, [data, enabled, profileId, supported])

  const toggleHideRequesterName = useCallback(() => {
    if (!profileId) return
    const next = !hideRequesterNameRef.current
    hideRequesterNameRef.current = next
    setHideRequesterName(next)
    saveDesktopNotificationSettings(profileId, {
      schemaVersion: DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION,
      enabled,
      notifiedUpToIso: notifiedUpToRef.current,
      hideRequesterName: next,
      revealReviewTitle: revealReviewTitleRef.current,
    })
  }, [enabled, profileId])

  const toggleRevealReviewTitle = useCallback(() => {
    if (!profileId) return
    const next = !revealReviewTitleRef.current
    revealReviewTitleRef.current = next
    setRevealReviewTitle(next)
    saveDesktopNotificationSettings(profileId, {
      schemaVersion: DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION,
      enabled,
      notifiedUpToIso: notifiedUpToRef.current,
      hideRequesterName: hideRequesterNameRef.current,
      revealReviewTitle: next,
    })
  }, [enabled, profileId])

  return {
    supported,
    enabled,
    permission,
    toggle,
    hideRequesterName,
    toggleHideRequesterName,
    revealReviewTitle,
    toggleRevealReviewTitle,
  }
}
