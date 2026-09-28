import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBackgroundRefresh } from './useBackgroundRefresh'

describe('useBackgroundRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls on the safety-net interval when enabled', () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useBackgroundRefresh(true, refresh))

    vi.advanceTimersByTime(5 * 60_000)
    expect(refresh).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(5 * 60_000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('does nothing when disabled', () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useBackgroundRefresh(false, refresh))

    vi.advanceTimersByTime(20 * 60_000)
    window.dispatchEvent(new Event('focus'))

    expect(refresh).not.toHaveBeenCalled()
  })

  it('refreshes on window focus but throttles bursts', () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useBackgroundRefresh(true, refresh))

    window.dispatchEvent(new Event('focus'))
    expect(refresh).toHaveBeenCalledTimes(1)

    // 30초 안의 연속 포커스는 무시된다.
    vi.advanceTimersByTime(10_000)
    window.dispatchEvent(new Event('focus'))
    expect(refresh).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(31_000)
    window.dispatchEvent(new Event('focus'))
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('stops polling after unmount', () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const { unmount } = renderHook(() => useBackgroundRefresh(true, refresh))

    unmount()
    vi.advanceTimersByTime(20 * 60_000)
    window.dispatchEvent(new Event('focus'))

    expect(refresh).not.toHaveBeenCalled()
  })

  it('swallows refresh failures and keeps polling', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('network down'))
    renderHook(() => useBackgroundRefresh(true, refresh))

    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(refresh).toHaveBeenCalledTimes(1)
    // 실패 뒤 30초 재시도 1회
    await vi.advanceTimersByTimeAsync(30_000)
    expect(refresh).toHaveBeenCalledTimes(2)
    // 재시도의 실패는 다시 예약하지 않고, 다음 주기는 그대로 돈다.
    await vi.advanceTimersByTimeAsync(4 * 60_000)
    expect(refresh).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('retries once 30 seconds after a failure without stacking retries', async () => {
    const refresh = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(undefined)
    renderHook(() => useBackgroundRefresh(true, refresh))

    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(refresh).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(29_000)
    expect(refresh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(refresh).toHaveBeenCalledTimes(2)

    // 재시도가 성공하면 더 예약하지 않는다.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('lifts the throttle after a failure so the next focus retries immediately', async () => {
    const refresh = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(undefined)
    renderHook(() => useBackgroundRefresh(true, refresh))

    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    window.dispatchEvent(new Event('focus'))
    expect(refresh).toHaveBeenCalledTimes(2)

    // 창 복귀 재시도가 나갔으므로 예약된 재시도는 취소된다.
    await vi.advanceTimersByTimeAsync(30_000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('cancels a scheduled retry on unmount', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('network down'))
    const { unmount } = renderHook(() => useBackgroundRefresh(true, refresh))

    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    unmount()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes when the browser comes back online', () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useBackgroundRefresh(true, refresh))

    window.dispatchEvent(new Event('online'))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  describe('while the tab is hidden', () => {
    let hidden = false
    beforeEach(() => {
      hidden = true
      vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
      vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => (hidden ? 'hidden' : 'visible'))
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('skips the interval tick and refreshes immediately when the tab becomes visible', () => {
      const refresh = vi.fn().mockResolvedValue(undefined)
      renderHook(() => useBackgroundRefresh(true, refresh))

      vi.advanceTimersByTime(10 * 60_000)
      expect(refresh).not.toHaveBeenCalled()

      hidden = false
      document.dispatchEvent(new Event('visibilitychange'))
      expect(refresh).toHaveBeenCalledTimes(1)
    })

    it('keeps polling hidden tabs when pollWhenHidden is set', () => {
      const refresh = vi.fn().mockResolvedValue(undefined)
      renderHook(() => useBackgroundRefresh(true, refresh, { pollWhenHidden: true }))

      vi.advanceTimersByTime(5 * 60_000)
      expect(refresh).toHaveBeenCalledTimes(1)
    })
  })
})
