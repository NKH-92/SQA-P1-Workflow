import type { AppData } from '../types'
import { eventTime } from './dates'

/** 현재 localStorage settings shape 버전. 필드를 추가/변경하면 올리고 마이그레이션을 손본다. */
export const DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION = 3

/** 파트장 데스크톱 알림 설정. readState와 같은 계정별 localStorage 패턴. */
export type DesktopNotificationSettings = {
  schemaVersion: typeof DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION
  enabled: boolean
  /** 이 시각(포함)까지의 요청은 이미 알렸거나 알리지 않기로 한 기준선 ISO. */
  notifiedUpToIso: string | null
  /** true면 알림 title에서 requester 이름을 숨기고 종류만 표시한다. 잠금화면 안전 기본값은 true. */
  hideRequesterName: boolean
  /** true면 알림 body에 검토 제목을 노출한다. 기본값 false — 잠금화면에 검토 내용이 그대로 보이지 않게 한다. */
  revealReviewTitle: boolean
}

/** 잠금화면에서도 안전한 알림 body 기본값 — 검토 제목/내용을 노출하지 않는다. */
export const SAFE_DEFAULT_NOTIFICATION_BODY = '새 검토요청이 접수되었습니다. 앱을 열어 확인하세요.'

const defaultSettings: DesktopNotificationSettings = {
  schemaVersion: DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION,
  enabled: false,
  notifiedUpToIso: null,
  hideRequesterName: true,
  revealReviewTitle: false,
}

function storageKey(userId: string) {
  return `desktopNotif:${userId}`
}

/**
 * v1(schemaVersion 없이 enabled/notifiedUpToIso만 있던 shape)은 새 privacy 필드를
 * 안전 기본값으로 채워 마이그레이션한다. 이 코드가 아는 것보다 더 새로운 schemaVersion은
 * 알 수 없는 shape를 신뢰하지 않고 기본값으로 안전하게 폴백한다.
 */
export function loadDesktopNotificationSettings(userId: string): DesktopNotificationSettings {
  if (typeof localStorage === 'undefined') return defaultSettings
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return defaultSettings
    const parsed = JSON.parse(raw) as Partial<DesktopNotificationSettings> & { schemaVersion?: unknown }
    if (
      typeof parsed.schemaVersion === 'number' &&
      parsed.schemaVersion > DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION
    ) {
      return defaultSettings
    }
    return {
      schemaVersion: DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION,
      enabled: parsed.enabled === true,
      notifiedUpToIso: parsed.notifiedUpToIso ?? null,
      hideRequesterName: typeof parsed.hideRequesterName === 'boolean' ? parsed.hideRequesterName : true,
      revealReviewTitle: parsed.revealReviewTitle === true,
    }
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

export type NotificationPrivacyPrefs = Pick<DesktopNotificationSettings, 'hideRequesterName' | 'revealReviewTitle'>

/**
 * 실제로 OS에 표시할 title/body를 계산한다. body는 opt-in(revealReviewTitle) 전까지
 * 항상 안전 기본 문구다 — 잠금화면에서 누구나 볼 수 있는 채널이기 때문이다.
 */
export function buildNotificationContent(
  alert: PendingReviewAlert,
  prefs: NotificationPrivacyPrefs,
): { title: string; body: string } {
  const kind = alert.isResubmission ? '재검토 요청' : '새 검토요청'
  const title = prefs.hideRequesterName ? kind : `${kind} · ${alert.requesterName}`
  const body = prefs.revealReviewTitle ? alert.title : SAFE_DEFAULT_NOTIFICATION_BODY
  return { title, body }
}

/**
 * 페이지 컨텍스트 Notification 생성. Chromium 계열 Android는 'Notification' in window가
 * true이고 권한도 granted지만 생성자 자체가 Illegal constructor를 던진다
 * (ServiceWorkerRegistration.showNotification만 허용). 알림은 부가 기능이므로
 * 생성 실패가 앱을 오류 화면으로 떨어뜨리지 않도록 여기서 흡수한다.
 */
export function showPendingReviewNotification(
  alert: PendingReviewAlert,
  prefs: NotificationPrivacyPrefs,
  onClick: () => void,
): void {
  try {
    const { title, body } = buildNotificationContent(alert, prefs)
    const notification = new Notification(title, {
      body,
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
