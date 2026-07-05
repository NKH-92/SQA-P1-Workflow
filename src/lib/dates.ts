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
