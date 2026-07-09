import { describe, expect, it } from 'vitest'
import { dueDateStatus, dueUrgency, eventTime } from './dates'

const now = new Date('2026-07-06T12:00:00')

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
