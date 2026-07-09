import { formatDate } from './format'

const DAY_MS = 86400000

export function dateOnlyTime(value?: string | null) {
  if (!value) return null
  const time = Date.parse(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(time) ? null : time
}

export function daysUntil(value?: string | null, now = new Date()) {
  const dueTime = dateOnlyTime(value)
  if (dueTime == null) return null
  const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.ceil((dueTime - todayTime) / DAY_MS)
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
  const startOfDay = (input: number) => {
    const date = new Date(input)
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  }
  // round: DST 등으로 하루가 정확히 24h가 아니어도 달력 일수가 흔들리지 않게 한다.
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(time)) / DAY_MS))
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
