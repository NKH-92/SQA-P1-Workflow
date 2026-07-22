import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SYNC_HEALTH_FAILURE_WARNING_THRESHOLD,
  SYNC_HEALTH_STALE_AFTER_MS,
  initialSyncHealth,
  useSyncHealth,
} from './useSyncHealth'

describe('useSyncHealth', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-20T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts healthy', () => {
    const { result } = renderHook(() => useSyncHealth())
    expect(result.current.syncHealth).toEqual(initialSyncHealth)
  })

  it('records a single failure without marking stale (첫 1회 background 실패는 상태만 기록)', () => {
    const { result } = renderHook(() => useSyncHealth())

    act(() => result.current.recordSyncFailure(new Error('failed to fetch')))

    expect(result.current.syncHealth.consecutiveFailures).toBe(1)
    expect(result.current.syncHealth.stale).toBe(false)
    expect(result.current.syncHealth.lastErrorCode).toBe('network')
    expect(result.current.syncHealth.lastFailureAt).toEqual(new Date('2026-07-20T00:00:00.000Z'))
  })

  it('marks stale once consecutive failures reach the warning threshold', () => {
    const { result } = renderHook(() => useSyncHealth())

    for (let i = 0; i < SYNC_HEALTH_FAILURE_WARNING_THRESHOLD; i += 1) {
      act(() => result.current.recordSyncFailure(new Error('failed to fetch')))
      vi.advanceTimersByTime(5 * 60_000)
    }

    expect(result.current.syncHealth.consecutiveFailures).toBe(SYNC_HEALTH_FAILURE_WARNING_THRESHOLD)
    expect(result.current.syncHealth.stale).toBe(true)
  })

  it('marks stale once time since the last success exceeds the policy threshold, even with only one recorded failure', () => {
    const { result } = renderHook(() => useSyncHealth())

    act(() => result.current.recordSyncSuccess())
    vi.setSystemTime(new Date(Date.now() + SYNC_HEALTH_STALE_AFTER_MS + 1))
    act(() => result.current.recordSyncFailure(new Error('failed to fetch')))

    expect(result.current.syncHealth.consecutiveFailures).toBe(1)
    expect(result.current.syncHealth.stale).toBe(true)
  })

  it('ages into stale automatically after the threshold without requiring another sync event', () => {
    const { result } = renderHook(() => useSyncHealth())

    act(() => result.current.recordSyncSuccess())
    expect(result.current.syncHealth.stale).toBe(false)

    act(() => vi.advanceTimersByTime(SYNC_HEALTH_STALE_AFTER_MS))

    expect(result.current.syncHealth.stale).toBe(true)
    expect(result.current.syncHealth.consecutiveFailures).toBe(0)
  })

  it('resets to healthy on success (네트워크 복구 후 warning 자동 해제)', () => {
    const { result } = renderHook(() => useSyncHealth())

    act(() => result.current.recordSyncFailure(new Error('failed to fetch')))
    act(() => result.current.recordSyncFailure(new Error('failed to fetch')))
    expect(result.current.syncHealth.stale).toBe(true)

    act(() => result.current.recordSyncSuccess())

    expect(result.current.syncHealth.consecutiveFailures).toBe(0)
    expect(result.current.syncHealth.stale).toBe(false)
    expect(result.current.syncHealth.lastErrorCode).toBeNull()
    expect(result.current.syncHealth.lastSuccessAt).toEqual(new Date())
  })

  it('resetSyncHealth returns to the initial state (로그아웃 시 reset)', () => {
    const { result } = renderHook(() => useSyncHealth())

    act(() => result.current.recordSyncFailure(new Error('failed to fetch')))
    act(() => result.current.resetSyncHealth())

    expect(result.current.syncHealth).toEqual(initialSyncHealth)
  })

  it('never stores raw error message content — only a classified, PII-free code', () => {
    const { result } = renderHook(() => useSyncHealth())
    const sensitive = new Error('leaked review body: "credit card 1234-5678" for user secret@example.com')

    act(() => result.current.recordSyncFailure(sensitive))

    const code = result.current.syncHealth.lastErrorCode
    expect(code).toBe('unknown')
    expect(code).not.toContain('@')
    expect(code).not.toContain('credit card')
  })
})
