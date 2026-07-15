import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  initialNotifiedUpTo,
  loadDesktopNotificationSettings,
  saveDesktopNotificationSettings,
  selectNewPendingReviews,
  showPendingReviewNotification,
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
    expect(alerts[0].isResubmission).toBe(false)
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
      new Set([`r-1:${Date.parse('2026-07-09T09:10:00.000Z')}`]),
    )

    expect(alerts).toEqual([])
  })

  it('picks a same-row resubmission using last_submitted_at', () => {
    const alerts = selectNewPendingReviews(
      {
        reviewRequests: [review({
          id: 'r-1',
          status: 'pending',
          created_at: '2026-07-01T00:00:00.000Z',
          review_round: 2,
          last_submitted_at: '2026-07-09T09:10:00.000Z',
        })],
      },
      cutoff,
      new Set(),
    )

    expect(alerts).toEqual([
      expect.objectContaining({
        id: 'r-1',
        notificationKey: `r-1:${Date.parse('2026-07-09T09:10:00.000Z')}`,
        isResubmission: true,
      }),
    ])
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

describe('showPendingReviewNotification', () => {
  const alert = {
    id: 'r-1',
    notificationKey: 'r-1:0',
    title: '검토 제목',
    requesterName: '김파트',
    isResubmission: false,
    at: 0,
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates a notification and wires click to the handler before closing', () => {
    const created: FakeNotification[] = []
    class FakeNotification {
      onclick: (() => void) | null = null
      close = vi.fn()
      constructor(
        public title: string,
        public options?: NotificationOptions,
      ) {
        created.push(this)
      }
    }
    vi.stubGlobal('Notification', FakeNotification)

    const onClick = vi.fn()
    showPendingReviewNotification(alert, onClick)

    expect(created).toHaveLength(1)
    expect(created[0].title).toBe('새 검토요청 · 김파트')
    expect(created[0].options).toMatchObject({ body: '검토 제목', tag: 'review-r-1' })
    expect(created[0].onclick).toBeTypeOf('function')
    created[0].onclick?.()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(created[0].close).toHaveBeenCalledTimes(1)
    expect(onClick.mock.invocationCallOrder[0]).toBeLessThan(created[0].close.mock.invocationCallOrder[0])
  })

  it('swallows constructor failure — Chromium Android throws Illegal constructor in page context', () => {
    class ThrowingNotification {
      constructor() {
        throw new TypeError('Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead.')
      }
    }
    vi.stubGlobal('Notification', ThrowingNotification)

    expect(() => showPendingReviewNotification(alert, vi.fn())).not.toThrow()
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
