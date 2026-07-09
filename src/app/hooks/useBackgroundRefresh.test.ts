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

    vi.advanceTimersByTime(5 * 60_000)
    await Promise.resolve()
    vi.advanceTimersByTime(5 * 60_000)

    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
