import { formatDate } from './format'
import { businessDateKey } from './businessTime'

const DAY_MS = 86400000

export function dateOnlyTime(value?: string | null) {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const date = new Date(time)
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3])
    ? time
    : null
}

export function daysUntil(value?: string | null, now = new Date()) {
  const dueTime = dateOnlyTime(value)
  if (dueTime == null) return null
  const todayTime = dateOnlyTime(businessDateKey(now))
  if (todayTime == null) return null
  return Math.round((dueTime - todayTime) / DAY_MS)
}

export function ageInDays(value?: string | null, now = Date.now()) {
  if (!value) return 0
  const time = Date.parse(value)
  if (Number.isNaN(time)) return 0
  return Math.max(0, Math.floor((now - time) / DAY_MS))
}

/* 표기 규칙(DESIGN.md·D1): 목록은 상대 표기, 상세·hover(title)는 절대 날짜. */

/** 자정 기준 달력 일수. 어제 저녁 항목이 다음 날 아침에 '오늘'로 보이면 안 된다(daysUntil과 같은 기준). */
export function relativeDaysAgo(value?: string | null, now = Date.now()): number | null {
  if (!value) return null
  const time = Date.parse(value)
  if (Number.isNaN(time)) return null
  const valueDay = dateOnlyTime(businessDateKey(new Date(time)))
  const today = dateOnlyTime(businessDateKey(new Date(now)))
  if (valueDay == null || today == null) return null
  return Math.max(0, Math.round((today - valueDay) / DAY_MS))
}

export function relativeDateLabel(value?: string | null, now = Date.now()): string {
  const days = relativeDaysAgo(value, now)
  if (days == null) return '-'
  if (days === 0) return '오늘'
  if (days === 1) return '어제'
  if (days <= 30) return `${days}일 전`
  // 30일이 지나면 절대 날짜 — 옆의 툴팁(formatDate)과 같은 포맷을 쓴다.
  return formatDate(value)
}

/** 칩용 압축 D-표기: 지연 'n일 지남' / 오늘 / 내일 / 'D-n'. 기한이 없으면 null. */
export function dueDateShortLabel(value?: string | null, now = new Date()): string | null {
  const days = daysUntil(value, now)
  if (!value || days == null) return null
  if (days < 0) return `${Math.abs(days)}일 지남`
  if (days === 0) return '오늘'
  if (days === 1) return '내일'
  return `D-${days}`
}

export function dueDateLabel(value?: string | null, now = new Date()) {
  const days = daysUntil(value, now)
  if (!value || days == null) return '기한 없음'
  if (days < 0) return `기한 ${Math.abs(days)}일 초과`
  if (days === 0) return '오늘까지'
  if (days === 1) return '내일까지'
  return `${days}일 남음`
}

export function dueDateStatus(value?: string | null, now = new Date()) {
  const days = daysUntil(value, now)
  if (!value || days == null) return 'no_due'
  if (days < 0) return 'overdue'
  if (days <= 1) return 'due_now'
  if (days <= 7) return 'due_soon'
  return 'scheduled'
}

/**
 * 마감 긴급도 단일 기준(dueDateStatus 파생) — 리스트·칸반·홈·알림이 모두 이 함수를 쓴다.
 * 화면마다 긴급도 색이 달라지면 안 된다.
 */
export function dueUrgency(value?: string | null, now = new Date()): 'urgent' | 'warning' | 'normal' {
  const status = dueDateStatus(value, now)
  if (status === 'overdue' || status === 'due_now') return 'urgent'
  if (status === 'due_soon') return 'warning'
  return 'normal'
}

/** 정렬·비교용 epoch ms. 값이 없거나 파싱 불가면 0. */
export function eventTime(value?: string | null) {
  if (!value) return 0
  const time = Date.parse(value)
  return Number.isNaN(time) ? 0 : time
}
