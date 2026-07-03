import type { ProjectStatus, ReviewStatus, Role } from '../types'

export const roleLabels: Record<Role, string> = {
  leader: '파트장',
  member: '파트원',
}

export const reviewStatusLabels: Record<ReviewStatus, string> = {
  pending: '대기중',
  in_review: '검토중',
  approved: '완료',
  rejected: '반려',
}

export const projectStatusLabels: Record<ProjectStatus, string> = {
  planned: '예정',
  in_progress: '진행중',
  done: '완료',
}

export function formatDate(value?: string | null): string {
  if (!value) return '-'
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const date = dateOnly
    ? (() => {
        const year = Number(dateOnly[1])
        const month = Number(dateOnly[2]) - 1
        const day = Number(dateOnly[3])
        const parsed = new Date(year, month, day)
        return parsed.getFullYear() === year && parsed.getMonth() === month && parsed.getDate() === day
          ? parsed
          : new Date(Number.NaN)
      })()
    : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}
