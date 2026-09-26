import type { ProjectStatus, ReviewStatus, Role } from '../types'
import { businessDateParts } from './businessTime'

export const roleLabels: Record<Role, string> = {
  leader: '파트장',
  team_leader: '팀장',
  member: '파트원',
}

/**
 * 검토요청 상태 이름의 단일 원천(DESIGN.md §용어). 결정은 ‘승인 ↔ 반려’ 짝으로 부른다.
 * 다른 화면·통계·진행 기록도 이 표를 쓰고, 같은 상태를 다른 말로 부르지 않는다.
 */
export const reviewStatusLabels: Record<ReviewStatus, string> = {
  pending: '대기 중',
  approved: '승인',
  rejected: '반려',
  withdrawn: '회수',
}

export const projectStatusLabels: Record<ProjectStatus, string> = {
  planned: '예정',
  in_progress: '진행 중',
  done: '완료',
}

type CalendarParts = { year: number; month: number; day: number; hour: number | null; minute: number | null }

/**
 * 'YYYY-MM-DD'는 달력 날짜 그대로 읽고(시간대 변환 없음), 그 밖의 시각 값은 업무 시간대(Asia/Seoul) 기준으로 읽는다.
 * 없는 날짜(2026-02-30 등)나 잘못된 값은 null.
 */
function calendarParts(value: string | number | Date | null | undefined): CalendarParts | null {
  if (value == null || value === '') return null
  if (typeof value === 'string') {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (dateOnly) {
      const year = Number(dateOnly[1])
      const month = Number(dateOnly[2])
      const day = Number(dateOnly[3])
      const probe = new Date(Date.UTC(year, month - 1, day))
      const valid = probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
      return valid ? { year, month, day, hour: null, minute: null } : null
    }
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const { year, month, day, hour, minute } = businessDateParts(date)
  return { year, month, day, hour, minute }
}

function clockText(hour: number, minute: number): string {
  const period = hour < 12 ? '오전' : '오후'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${period} ${hour12}:${String(minute).padStart(2, '0')}`
}

/*
 * 날짜 표기는 이 파일에서만 만든다(DESIGN.md §8). 두 가지 모양만 쓴다.
 * - 날짜: 올해면 ‘7월 3일’, 다른 해면 ‘2025년 12월 3일’ (formatDate)
 * - 날짜와 시각: ‘2026년 7월 3일 오후 5:00’ (formatDateTime — 상세·툴팁처럼 정확한 시각이 필요한 곳)
 * 칩·진행 기록처럼 좁은 곳은 formatMonthDay(‘9월 26일’), 시각만 필요하면 formatClock(‘오후 2:05’).
 */

/** 목록·상세 공통 날짜. 올해면 ‘7월 3일’, 다른 해면 ‘2025년 12월 3일’. 값이 없거나 잘못되면 ‘-’. */
export function formatDate(value?: string | null, now: Date = new Date()): string {
  const parts = calendarParts(value)
  if (!parts) return '-'
  const monthDay = `${parts.month}월 ${parts.day}일`
  return parts.year === businessDateParts(now).year ? monthDay : `${parts.year}년 ${monthDay}`
}

/** 정확한 날짜와 시각: ‘2026년 7월 3일 오후 5:00’. 날짜만 있는 값은 날짜까지만 쓴다. 잘못되면 ‘-’. */
export function formatDateTime(value?: string | null): string {
  const parts = calendarParts(value)
  if (!parts) return '-'
  const date = `${parts.year}년 ${parts.month}월 ${parts.day}일`
  return parts.hour == null || parts.minute == null ? date : `${date} ${clockText(parts.hour, parts.minute)}`
}

/** 좁은 칩·진행 기록용 월·일: ‘9월 26일’. 값이 없거나 잘못되면 null. */
export function formatMonthDay(value: string | number | Date | null | undefined): string | null {
  const parts = calendarParts(value)
  return parts ? `${parts.month}월 ${parts.day}일` : null
}

const weekdayDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
})

/** 홈 인사 줄처럼 오늘을 알려 줄 때: ‘9월 27일 일요일’ */
export function formatDateWithWeekday(value: Date): string {
  return Number.isNaN(value.getTime()) ? '-' : weekdayDateFormatter.format(value)
}

/** 시각만: ‘오전 12:41’, ‘오후 2:05’. 날짜만 있는 값이나 잘못된 값은 null. */
export function formatClock(value: string | number | Date | null | undefined): string | null {
  const parts = calendarParts(value)
  return parts && parts.hour != null && parts.minute != null ? clockText(parts.hour, parts.minute) : null
}

export function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}
