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

export function leavesOnDay(leaves: readonly MemberLeave[], day: string): MemberLeave[] {
  return leaves.filter(leave => leave.starts_on <= day && leave.ends_on >= day)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id))
}
