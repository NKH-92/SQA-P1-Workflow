import { describe, expect, it } from 'vitest'
import {
  daysUntil,
  dueDateStatus,
  dueUrgency,
  eventTime,
  relativeDaysAgo,
} from './dates'

const now = new Date('2026-07-06T03:00:00.000Z')

describe('dueDateStatus', () => {
  it('classifies overdue / due_now / due_soon / scheduled / no_due', () => {
    expect(dueDateStatus('2026-07-05', now)).toBe('overdue')
    expect(dueDateStatus('2026-07-06', now)).toBe('due_now')
    expect(dueDateStatus('2026-07-07', now)).toBe('due_now')
    expect(dueDateStatus('2026-07-10', now)).toBe('due_soon')
    expect(dueDateStatus('2026-07-20', now)).toBe('scheduled')
    expect(dueDateStatus(null, now)).toBe('no_due')
  })
})

describe('dueUrgency', () => {
  it('maps status to the shared urgency levels used by list, kanban, home, and notifications', () => {
    expect(dueUrgency('2026-07-05', now)).toBe('urgent')
    expect(dueUrgency('2026-07-07', now)).toBe('urgent')
    expect(dueUrgency('2026-07-10', now)).toBe('warning')
    expect(dueUrgency('2026-07-20', now)).toBe('normal')
    expect(dueUrgency(null, now)).toBe('normal')
  })
})

describe('eventTime', () => {
  it('parses ISO timestamps and falls back to 0 for missing or invalid values', () => {
    expect(eventTime('2026-07-01T00:00:00.000Z')).toBe(Date.parse('2026-07-01T00:00:00.000Z'))
    expect(eventTime(null)).toBe(0)
    expect(eventTime(undefined)).toBe(0)
    expect(eventTime('not-a-date')).toBe(0)
  })
})

describe('Asia/Seoul date helpers', () => {
  it('uses the KST business date independently of the host timezone', () => {
    const currentTime = new Date('2026-07-17T00:00:00.000Z')
    expect(daysUntil('2026-07-16', currentTime)).toBe(-1)
    expect(daysUntil('2026-07-17', currentTime)).toBe(0)
    expect(daysUntil('2026-07-20', currentTime)).toBe(3)
  })

  it('changes relative day labels at KST midnight', () => {
    const event = Date.parse('2026-07-16T14:59:00.000Z')
    expect(relativeDaysAgo(new Date(event).toISOString(), Date.parse('2026-07-16T15:01:00.000Z'))).toBe(1)
  })
})
