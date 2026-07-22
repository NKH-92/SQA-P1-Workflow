import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION,
  SAFE_DEFAULT_NOTIFICATION_BODY,
  buildNotificationContent,
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

describe('buildNotificationContent — privacy defaults', () => {
  const alert = {
    id: 'r-1',
    notificationKey: 'r-1:0',
    title: '검토 제목: 매출 대시보드 검토',
    requesterName: '김파트',
    isResubmission: false,
    at: 0,
  }

  it('uses the safe generic body and shows the requester name by default', () => {
    const content = buildNotificationContent(alert, { hideRequesterName: false, revealReviewTitle: false })
    expect(content).toEqual({ title: '새 검토요청 · 김파트', body: SAFE_DEFAULT_NOTIFICATION_BODY })
  })

  it('hides the requester name when opted in, keeping the safe body', () => {
    const content = buildNotificationContent(alert, { hideRequesterName: true, revealReviewTitle: false })
    expect(content).toEqual({ title: '새 검토요청', body: SAFE_DEFAULT_NOTIFICATION_BODY })
  })

  it('reveals the review title in the body only when opted in', () => {
    const content = buildNotificationContent(alert, { hideRequesterName: false, revealReviewTitle: true })
    expect(content).toEqual({ title: '새 검토요청 · 김파트', body: alert.title })
  })

  it('labels a resubmission distinctly even with the requester name hidden', () => {
    const content = buildNotificationContent(
      { ...alert, isResubmission: true },
      { hideRequesterName: true, revealReviewTitle: false },
    )
    expect(content.title).toBe('재검토 요청')
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

  it('creates a notification using the safe default body by default', () => {
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
    showPendingReviewNotification(alert, { hideRequesterName: false, revealReviewTitle: false }, onClick)

    expect(created).toHaveLength(1)
    expect(created[0].title).toBe('새 검토요청 · 김파트')
    expect(created[0].options).toMatchObject({ body: SAFE_DEFAULT_NOTIFICATION_BODY, tag: 'review-r-1' })
    expect(created[0].onclick).toBeTypeOf('function')
    created[0].onclick?.()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(created[0].close).toHaveBeenCalledTimes(1)
    expect(onClick.mock.invocationCallOrder[0]).toBeLessThan(created[0].close.mock.invocationCallOrder[0])
  })

  it('respects opted-in privacy prefs when building the notification', () => {
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

    showPendingReviewNotification(alert, { hideRequesterName: true, revealReviewTitle: true }, vi.fn())

    expect(created[0].title).toBe('새 검토요청')
    expect(created[0].options).toMatchObject({ body: '검토 제목' })
  })

  it('swallows constructor failure — Chromium Android throws Illegal constructor in page context', () => {
    class ThrowingNotification {
      constructor() {
        throw new TypeError('Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead.')
      }
    }
    vi.stubGlobal('Notification', ThrowingNotification)

    expect(() =>
      showPendingReviewNotification(alert, { hideRequesterName: false, revealReviewTitle: false }, vi.fn()),
    ).not.toThrow()
  })
})

describe('desktop notification settings storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips settings per user, including the schema version and privacy fields', () => {
    saveDesktopNotificationSettings('leader-1', {
      schemaVersion: DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION,
      enabled: true,
      notifiedUpToIso: '2026-07-09T09:00:00.000Z',
      hideRequesterName: true,
      revealReviewTitle: true,
    })

    expect(loadDesktopNotificationSettings('leader-1')).toEqual({
      schemaVersion: DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION,
      enabled: true,
      notifiedUpToIso: '2026-07-09T09:00:00.000Z',
      hideRequesterName: true,
      revealReviewTitle: true,
    })
    expect(loadDesktopNotificationSettings('leader-2')).toEqual({
      schemaVersion: DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION,
      enabled: false,
      notifiedUpToIso: null,
      hideRequesterName: false,
      revealReviewTitle: false,
    })
  })

  it('falls back to defaults on corrupted storage', () => {
    localStorage.setItem('desktopNotif:leader-1', '{not-json')

    expect(loadDesktopNotificationSettings('leader-1')).toEqual({
      schemaVersion: DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION,
      enabled: false,
      notifiedUpToIso: null,
      hideRequesterName: false,
      revealReviewTitle: false,
    })
  })

  it('migrates a legacy v1 record (no schemaVersion, no privacy fields) to safe defaults', () => {
    localStorage.setItem(
      'desktopNotif:leader-1',
      JSON.stringify({ enabled: true, notifiedUpToIso: '2026-07-09T09:00:00.000Z' }),
    )

    expect(loadDesktopNotificationSettings('leader-1')).toEqual({
      schemaVersion: DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION,
      enabled: true,
      notifiedUpToIso: '2026-07-09T09:00:00.000Z',
      hideRequesterName: false,
      revealReviewTitle: false,
    })
  })

  it('does not trust a future schemaVersion it does not understand — falls back to defaults', () => {
    localStorage.setItem(
      'desktopNotif:leader-1',
      JSON.stringify({
        schemaVersion: DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION + 1,
        enabled: true,
        notifiedUpToIso: '2026-07-09T09:00:00.000Z',
        hideRequesterName: false,
        revealReviewTitle: true,
      }),
    )

    expect(loadDesktopNotificationSettings('leader-1')).toEqual({
      schemaVersion: DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION,
      enabled: false,
      notifiedUpToIso: null,
      hideRequesterName: false,
      revealReviewTitle: false,
    })
  })
})
