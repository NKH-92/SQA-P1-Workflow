import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData } from '../../demoData'
import {
  DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION,
  loadDesktopNotificationSettings,
  saveDesktopNotificationSettings,
} from '../../lib/desktopNotifications'
import { useDesktopNotifications } from './useDesktopNotifications'

const PROFILE_ID = 'leader-1'

class FakeNotification {
  static permission: NotificationPermission = 'granted'
  static requestPermission = vi.fn(async () => FakeNotification.permission)
}

function saveEnabled() {
  saveDesktopNotificationSettings(PROFILE_ID, {
    schemaVersion: DESKTOP_NOTIFICATION_SETTINGS_SCHEMA_VERSION,
    enabled: true,
    notifiedUpToIso: '2026-09-27T00:00:00.000Z',
    hideRequesterName: true,
    revealReviewTitle: false,
  })
}

function renderNotifications(data = createPreviewData()) {
  return renderHook(({ current }) => useDesktopNotifications(PROFILE_ID, true, current, vi.fn()), {
    initialProps: { current: data },
  })
}

describe('useDesktopNotifications', () => {
  beforeEach(() => {
    localStorage.clear()
    FakeNotification.permission = 'granted'
    FakeNotification.requestPermission.mockClear()
    vi.stubGlobal('Notification', FakeNotification)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('restores the saved on state when the browser still allows notifications', () => {
    saveEnabled()
    const { result } = renderNotifications()
    expect(result.current.enabled).toBe(true)
    expect(result.current.permission).toBe('granted')
  })

  it('shows notifications as off when the browser permission was reset, and one click asks again', async () => {
    saveEnabled()
    FakeNotification.permission = 'default'
    const { result } = renderNotifications()
    expect(result.current.enabled).toBe(false)
    expect(result.current.permission).toBe('default')
    // 저장값은 그대로 둔다.
    expect(loadDesktopNotificationSettings(PROFILE_ID).enabled).toBe(true)

    FakeNotification.requestPermission.mockImplementationOnce(async () => {
      FakeNotification.permission = 'granted'
      return 'granted'
    })
    await act(async () => {
      await result.current.toggle()
    })
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1)
    expect(result.current.enabled).toBe(true)
    expect(result.current.permission).toBe('granted')
  })

  it('shows the blocked state when the permission was denied', () => {
    saveEnabled()
    FakeNotification.permission = 'denied'
    const { result } = renderNotifications()
    expect(result.current.enabled).toBe(false)
    expect(result.current.permission).toBe('denied')
  })

  it('turns the switch off when the permission is revoked while the app is open', () => {
    saveEnabled()
    const data = createPreviewData()
    const { result, rerender } = renderNotifications(data)
    expect(result.current.enabled).toBe(true)

    FakeNotification.permission = 'default'
    rerender({ current: { ...data } })
    expect(result.current.enabled).toBe(false)
    expect(result.current.permission).toBe('default')
    expect(loadDesktopNotificationSettings(PROFILE_ID).enabled).toBe(true)
  })
})
