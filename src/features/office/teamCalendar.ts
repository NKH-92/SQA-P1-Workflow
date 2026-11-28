import type { MemberLeave } from '../../types'

/** Date-only arithmetic stays independent of the browser time zone. */
export function monthDays(month: string): Array<string | null> {
  const [year, number] = month.split('-').map(Number)
  const offset = new Date(Date.UTC(year, number - 1, 1)).getUTCDay()
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate()
  const cells = Math.ceil((offset + count) / 7) * 7
  return Array.from({ length: cells }, (_, index) => {
    const day = index - offset + 1
    return day < 1 || day > count ? null : `${month}-${String(day).padStart(2, '0')}`
  })
}

export function moveMonth(month: string, delta: number): string {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7)
}

/** Sort the leaves in the visible range once, preserving their order for each day. */
export function leavesByDay(leaves: readonly MemberLeave[], days: readonly string[]): Map<string, MemberLeave[]> {
  const sorted = leaves.filter(leave => leave.starts_on <= days[days.length - 1] && leave.ends_on >= days[0])
    .sort((a, b) => a.name.localeCompare(b.name, 'ko') || (a.day_period ?? '').localeCompare(b.day_period ?? '') || a.id.localeCompare(b.id))
  return new Map(days.map(day => [day, sorted.filter(leave => leave.starts_on <= day && leave.ends_on >= day)]))
}
