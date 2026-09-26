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

/**
 * 기한 표기의 단일 기준. 모든 화면이 같은 말을 쓴다(‘지남’ 하나로 통일, ‘초과’·‘D+n’ 혼용 금지).
 * - 지남: 'n일 지남' / 오늘: '오늘 마감' / 내일: '내일 마감' / 그 뒤: 칩은 'D-n', 문장은 'n일 남음'
 * - 끝난 항목(done)은 기한 경과를 보여주지 않는다.
 */
export type DueKind = 'none' | 'done' | 'overdue' | 'today' | 'tomorrow' | 'soon' | 'later'

export type DueState = {
  kind: DueKind
  /** 오늘 기준 남은 달력 일수(지났으면 음수). 기한이 없으면 null. */
  days: number | null
  /** 문장·상세용 표기 */
  label: string
  /** 칩·목록용 짧은 표기 */
  shortLabel: string
  tone: 'urgent' | 'warning' | 'normal' | 'done'
}

export function dueState(
  value?: string | null,
  { done = false, now = new Date(), soonDays = 7 }: { done?: boolean; now?: Date; soonDays?: number } = {},
): DueState {
  if (done) return { kind: 'done', days: null, label: '완료', shortLabel: '완료', tone: 'done' }
  const days = daysUntil(value, now)
  if (!value || days == null) return { kind: 'none', days: null, label: '기한 없음', shortLabel: '기한 없음', tone: 'normal' }
  if (days < 0) {
    const text = `${Math.abs(days)}일 지남`
    return { kind: 'overdue', days, label: text, shortLabel: text, tone: 'urgent' }
  }
  if (days === 0) return { kind: 'today', days, label: '오늘 마감', shortLabel: '오늘 마감', tone: 'urgent' }
  if (days === 1) return { kind: 'tomorrow', days, label: '내일 마감', shortLabel: '내일 마감', tone: 'urgent' }
  if (days <= soonDays) return { kind: 'soon', days, label: `${days}일 남음`, shortLabel: `D-${days}`, tone: 'warning' }
  return { kind: 'later', days, label: `${days}일 남음`, shortLabel: `D-${days}`, tone: 'normal' }
}

/** 아직 지나지 않았고 n일 안에 마감되는가. 이미 지난 항목은 ‘임박’이 아니라 ‘지남’이다. */
export function isDueWithin(value: string | null | undefined, withinDays: number, now = new Date()) {
  const days = daysUntil(value, now)
  return days != null && days >= 0 && days <= withinDays
}

/** 기한이 지났는가(오늘 마감은 아직 지나지 않았다). */
export function isOverdue(value: string | null | undefined, now = new Date()) {
  const days = daysUntil(value, now)
  return days != null && days < 0
}

/** 칩용 압축 표기: 'n일 지남' / '오늘 마감' / '내일 마감' / 'D-n'. 기한이 없으면 null. */
export function dueDateShortLabel(value?: string | null, now = new Date()): string | null {
  const state = dueState(value, { now })
  return state.kind === 'none' ? null : state.shortLabel
}

/** 문장·상세용 표기: '기한 없음' / 'n일 지남' / '오늘 마감' / '내일 마감' / 'n일 남음'. */
export function dueDateLabel(value?: string | null, now = new Date()) {
  return dueState(value, { now }).label
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
