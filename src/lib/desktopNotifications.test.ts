import { beforeEach, describe, expect, it } from 'vitest'
import {
  initialNotifiedUpTo,
  loadDesktopNotificationSettings,
  saveDesktopNotificationSettings,
  selectNewPendingReviews,
} from './desktopNotifications'
import type { ReviewRequest } from '../types'

function review(partial: Partial<ReviewRequest> & Pick<ReviewRequest, 'id' | 'status' | 'created_at'>): ReviewRequest {
  return {
    requester_id: 'member-1',
    title: '검토 제목',
    description: '설명',
    attachment_url: null,
    due_date: null,
    profiles: { name: '김파트', email: 'member@example.com' },
    ...partial,
  }
}

describe('selectNewPendingReviews', () => {
  const cutoff = '2026-07-09T09:00:00.000Z'

  it('picks only pending requests created after the cutoff, oldest first', () => {
    const alerts = selectNewPendingReviews(
      {
        reviewRequests: [
          review({ id: 'old-pending', status: 'pending', created_at: '2026-07-09T08:59:00.000Z' }),
          review({ id: 'new-late', status: 'pending', created_at: '2026-07-09T09:20:00.000Z' }),
          review({ id: 'new-early', status: 'pending', created_at: '2026-07-09T09:10:00.000Z' }),
          review({ id: 'new-closed', status: 'approved', created_at: '2026-07-09T09:30:00.000Z' }),
        ],
      },
      cutoff,
      new Set(),
    )

    expect(alerts.map((alert) => alert.id)).toEqual(['new-early', 'new-late'])
    expect(alerts[0].requesterName).toBe('김파트')
    expect(alerts[0].title).toBe('검토 제목')
  })

  it('returns nothing without a baseline — prevents a notification burst on first load', () => {
    const alerts = selectNewPendingReviews(
      { reviewRequests: [review({ id: 'r-1', status: 'pending', created_at: '2026-07-09T09:10:00.000Z' })] },
      null,
      new Set(),
    )

    expect(alerts).toEqual([])
  })

  it('skips requests that were already notified', () => {
    const alerts = selectNewPendingReviews(
      { reviewRequests: [review({ id: 'r-1', status: 'pending', created_at: '2026-07-09T09:10:00.000Z' })] },
      cutoff,
      new Set(['r-1']),
    )

    expect(alerts).toEqual([])
  })
})

describe('initialNotifiedUpTo', () => {
  it('uses now when it is ahead of the latest request', () => {
    const now = Date.parse('2026-07-09T10:00:00.000Z')
    const iso = initialNotifiedUpTo(
      { reviewRequests: [review({ id: 'r-1', status: 'pending', created_at: '2026-07-09T09:00:00.000Z' })] },
      now,
    )

    expect(iso).toBe('2026-07-09T10:00:00.000Z')
  })

  it('uses the latest request time when the client clock lags the server', () => {
    const laggingNow = Date.parse('2026-07-09T08:00:00.000Z')
    const iso = initialNotifiedUpTo(
      { reviewRequests: [review({ id: 'r-1', status: 'pending', created_at: '2026-07-09T09:00:00.000Z' })] },
      laggingNow,
    )

    expect(iso).toBe('2026-07-09T09:00:00.000Z')
  })
})

describe('desktop notification settings storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips settings per user', () => {
    saveDesktopNotificationSettings('leader-1', { enabled: true, notifiedUpToIso: '2026-07-09T09:00:00.000Z' })

    expect(loadDesktopNotificationSettings('leader-1')).toEqual({
      enabled: true,
      notifiedUpToIso: '2026-07-09T09:00:00.000Z',
    })
    expect(loadDesktopNotificationSettings('leader-2')).toEqual({ enabled: false, notifiedUpToIso: null })
  })

  it('falls back to defaults on corrupted storage', () => {
    localStorage.setItem('desktopNotif:leader-1', '{not-json')

    expect(loadDesktopNotificationSettings('leader-1')).toEqual({ enabled: false, notifiedUpToIso: null })
  })
})
