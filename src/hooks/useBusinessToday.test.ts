import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { businessDateKey } from '../lib/businessTime'
import { millisecondsUntilNextBusinessDay, useBusinessToday } from './useBusinessToday'

// CI는 TZ=UTC로 돈다. 서울 자정(KST 00:00)은 UTC 15:00이다.
const BEFORE_SEOUL_MIDNIGHT = new Date('2026-09-30T14:58:30.000Z') // KST 9/30 23:58:30

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(BEFORE_SEOUL_MIDNIGHT)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('millisecondsUntilNextBusinessDay', () => {
  it('waits until the Seoul date changes, not the host date', () => {
    const wait = millisecondsUntilNextBusinessDay(BEFORE_SEOUL_MIDNIGHT)
    expect(businessDateKey(new Date(BEFORE_SEOUL_MIDNIGHT.getTime() + wait))).toBe('2026-10-01')
    expect(businessDateKey(new Date(BEFORE_SEOUL_MIDNIGHT.getTime() + wait - 60_000))).toBe('2026-09-30')
  })
})

describe('useBusinessToday', () => {
  it('moves to the next Seoul day at Seoul midnight and keeps the same Date within a day', () => {
    const { result } = renderHook(() => useBusinessToday())
    const first = result.current
    expect(businessDateKey(first)).toBe('2026-09-30')

    // 같은 날 안에서는 같은 Date를 그대로 돌려준다(useMemo 의존성이 흔들리지 않게).
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current).toBe(first)

    act(() => {
      vi.advanceTimersByTime(2 * 60_000)
    })
    expect(businessDateKey(result.current)).toBe('2026-10-01')
  })

  it('re-checks the date when the tab becomes visible or regains focus (timers stall during sleep)', () => {
    const { result } = renderHook(() => useBusinessToday())
    expect(businessDateKey(result.current)).toBe('2026-09-30')

    // PC 절전: 벽시계만 다음 날 아침으로 가고 타이머는 돌지 않는다.
    vi.setSystemTime(new Date('2026-10-01T00:30:00.000Z')) // KST 10/1 09:30
    expect(businessDateKey(result.current)).toBe('2026-09-30')

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(businessDateKey(result.current)).toBe('2026-10-01')

    const afterVisible = result.current
    vi.setSystemTime(new Date('2026-10-01T15:10:00.000Z')) // KST 10/2 00:10
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(result.current).not.toBe(afterVisible)
    expect(businessDateKey(result.current)).toBe('2026-10-02')
  })

  it('ignores a visibility change that is not back to visible or stays on the same day', () => {
    const { result } = renderHook(() => useBusinessToday())
    const first = result.current

    vi.setSystemTime(new Date('2026-09-30T14:59:30.000Z')) // 아직 KST 9/30
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe(first)

    vi.setSystemTime(new Date('2026-10-01T00:30:00.000Z'))
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe(first)
    visibility.mockRestore()
  })

  it('removes its timer and listeners on unmount', () => {
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener')
    const removeWindowListener = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useBusinessToday())
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
    expect(removeDocumentListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(removeWindowListener).toHaveBeenCalledWith('focus', expect.any(Function))
  })
})
