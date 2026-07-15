import type { AppData } from '../types'
import { eventTime } from './dates'

/** 파트장 데스크톱 알림 설정. readState와 같은 계정별 localStorage 패턴. */
export type DesktopNotificationSettings = {
  enabled: boolean
  /** 이 시각(포함)까지의 요청은 이미 알렸거나 알리지 않기로 한 기준선 ISO. */
  notifiedUpToIso: string | null
}

const defaultSettings: DesktopNotificationSettings = { enabled: false, notifiedUpToIso: null }

function storageKey(userId: string) {
  return `desktopNotif:${userId}`
}

export function loadDesktopNotificationSettings(userId: string): DesktopNotificationSettings {
  if (typeof localStorage === 'undefined') return defaultSettings
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return defaultSettings
    const parsed = JSON.parse(raw) as Partial<DesktopNotificationSettings>
    return { enabled: parsed.enabled === true, notifiedUpToIso: parsed.notifiedUpToIso ?? null }
  } catch {
    return defaultSettings
  }
}

export function saveDesktopNotificationSettings(userId: string, settings: DesktopNotificationSettings) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(settings))
  } catch {
    // 저장이 막힌 환경(사생활 보호 모드 등)에서도 세션 내 동작은 유지한다.
  }
}

/**
 * 알림을 켜는 시점의 기준선. '지금'과 '현재 데이터의 최신 요청 시각' 중 더 나중을 쓴다 —
 * 클라이언트 시계가 서버보다 뒤처져 있어도 기존 대기 건이 새 요청으로 재발화하지 않는다.
 */
export function initialNotifiedUpTo(data: Pick<AppData, 'reviewRequests'>, now = Date.now()): string {
  const latest = data.reviewRequests.reduce(
    (max, request) => Math.max(max, eventTime(request.last_submitted_at ?? request.created_at)),
    0,
  )
  return new Date(Math.max(now, latest)).toISOString()
}

export type PendingReviewAlert = {
  id: string
  notificationKey: string
  title: string
  requesterName: string
  isResubmission: boolean
  /** epoch ms — 기준선 전진에 쓴다. */
  at: number
}

/**
 * 페이지 컨텍스트 Notification 생성. Chromium 계열 Android는 'Notification' in window가
 * true이고 권한도 granted지만 생성자 자체가 Illegal constructor를 던진다
 * (ServiceWorkerRegistration.showNotification만 허용). 알림은 부가 기능이므로
 * 생성 실패가 앱을 오류 화면으로 떨어뜨리지 않도록 여기서 흡수한다.
 */
export function showPendingReviewNotification(alert: PendingReviewAlert, onClick: () => void): void {
  try {
    const notification = new Notification(`${alert.isResubmission ? '재검토 요청' : '새 검토요청'} · ${alert.requesterName}`, {
      body: alert.title,
      // 같은 요청은 탭이 여러 개 열려 있어도 하나로 합쳐진다.
      tag: `review-${alert.id}`,
    })
    notification.onclick = () => {
      onClick()
      notification.close()
    }
  } catch {
    // 생성 불가 환경에서는 벨 뱃지와 목록 갱신만으로 충분하다.
  }
}

/**
 * 기준선 이후 새로 접수된 대기 검토요청 — 데스크톱 알림 대상.
 * 기준선이 없으면 아무것도 고르지 않는다 (첫 로드에서 기존 대기 건 폭탄 방지).
 */
export function selectNewPendingReviews(
  data: Pick<AppData, 'reviewRequests'>,
  notifiedUpToIso: string | null,
  alreadyNotifiedIds: ReadonlySet<string>,
): PendingReviewAlert[] {
  const cutoff = eventTime(notifiedUpToIso)
  if (cutoff === 0) return []
  return data.reviewRequests
    .filter((request) => request.status === 'pending')
    .map((request) => {
      const at = eventTime(request.last_submitted_at ?? request.created_at)
      return {
        id: request.id,
        notificationKey: `${request.id}:${at}`,
        title: request.title,
        requesterName: request.profiles?.name ?? '파트원',
        isResubmission: (request.review_round ?? 1) > 1,
        at,
      }
    })
    .filter((alert) => !alreadyNotifiedIds.has(alert.notificationKey))
    .filter((alert) => alert.at > cutoff)
    .sort((left, right) => left.at - right.at)
}
