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

describe('dueState (single due-date vocabulary)', () => {
  it('uses one wording for every state', async () => {
    const { dueState, dueDateLabel, dueDateShortLabel } = await import('./dates')
    expect(dueState('2026-07-03', { now }).label).toBe('3일 지남')
    expect(dueState('2026-07-06', { now }).label).toBe('오늘 마감')
    expect(dueState('2026-07-07', { now }).label).toBe('내일 마감')
    expect(dueState('2026-07-09', { now })).toMatchObject({ kind: 'soon', label: '3일 남음', shortLabel: 'D-3', tone: 'warning' })
    expect(dueState('2026-07-30', { now })).toMatchObject({ kind: 'later', shortLabel: 'D-24', tone: 'normal' })
    expect(dueState(null, { now }).label).toBe('기한 없음')
    expect(dueDateLabel('2026-07-01', now)).toBe('5일 지남')
    expect(dueDateShortLabel(null, now)).toBeNull()
  })

  it('never reports overdue for finished work and never calls overdue work imminent', async () => {
    const { dueState, isDueWithin, isOverdue } = await import('./dates')
    expect(dueState('2026-05-01', { now, done: true })).toMatchObject({ kind: 'done', label: '완료' })
    expect(isDueWithin('2026-05-01', 3, now)).toBe(false)
    expect(isDueWithin('2026-07-08', 3, now)).toBe(true)
    expect(isOverdue('2026-07-05', now)).toBe(true)
    expect(isOverdue('2026-07-06', now)).toBe(false)
  })
})
