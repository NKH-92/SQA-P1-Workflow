import { useCallback, useEffect, useState } from 'react'
import { toErrorCode } from '../../lib/errors'

export type SyncHealth = {
  consecutiveFailures: number
  lastSuccessAt: Date | null
  lastFailureAt: Date | null
  stale: boolean
  lastErrorCode: string | null
}

/**
 * 연속 실패가 이 값 이상이면 마지막 성공이 threshold 시간 내라도 topbar 경고를 띈다.
 * 1회 실패는 "조용히 기록"만 하고 사용자에게 보이지 않는다(표시 정책 참조).
 */
export const SYNC_HEALTH_FAILURE_WARNING_THRESHOLD = 2

/**
 * 마지막 성공으로부터 이 시간(ms)이 지나면 새 실패가 없어도 stale로 간주한다.
 * 5분 안전망 폴링(POLL_INTERVAL_MS) 기준 3회분 여유를 둔다.
 */
export const SYNC_HEALTH_STALE_AFTER_MS = 15 * 60_000

export const initialSyncHealth: SyncHealth = {
  consecutiveFailures: 0,
  lastSuccessAt: null,
  lastFailureAt: null,
  stale: false,
  lastErrorCode: null,
}

function computeStale(consecutiveFailures: number, lastSuccessAt: Date | null, now: number): boolean {
  if (consecutiveFailures >= SYNC_HEALTH_FAILURE_WARNING_THRESHOLD) return true
  if (lastSuccessAt && now - lastSuccessAt.getTime() >= SYNC_HEALTH_STALE_AFTER_MS) return true
  return false
}

/**
 * 백그라운드 폴링·focus 재조회·수동 새로고침 실패를 관측하는 상태 머신.
 * 표시 여부(토스트 vs topbar 경고)는 이 훅이 아니라 호출부/화면이 결정한다 — 이 훅은
 * "무슨 일이 있었는가"만 사실대로 축적한다.
 */
export function useSyncHealth() {
  const [syncHealth, setSyncHealth] = useState<SyncHealth>(initialSyncHealth)

  useEffect(() => {
    if (!syncHealth.lastSuccessAt || syncHealth.stale) return
    const remaining = Math.max(
      0,
      syncHealth.lastSuccessAt.getTime() + SYNC_HEALTH_STALE_AFTER_MS - Date.now(),
    )
    const timeout = window.setTimeout(() => {
      setSyncHealth((current) => ({
        ...current,
        stale: computeStale(current.consecutiveFailures, current.lastSuccessAt, Date.now()),
      }))
    }, remaining)
    return () => window.clearTimeout(timeout)
  }, [syncHealth.lastSuccessAt, syncHealth.stale])

  const recordSyncSuccess = useCallback(() => {
    setSyncHealth((prev) => ({
      consecutiveFailures: 0,
      lastSuccessAt: new Date(),
      lastFailureAt: prev.lastFailureAt,
      stale: false,
      lastErrorCode: null,
    }))
  }, [])

  const recordSyncFailure = useCallback((error: unknown) => {
    setSyncHealth((prev) => {
      const now = new Date()
      const consecutiveFailures = prev.consecutiveFailures + 1
      return {
        consecutiveFailures,
        lastSuccessAt: prev.lastSuccessAt,
        lastFailureAt: now,
        stale: computeStale(consecutiveFailures, prev.lastSuccessAt, now.getTime()),
        lastErrorCode: toErrorCode(error),
      }
    })
  }, [])

  const resetSyncHealth = useCallback(() => {
    setSyncHealth(initialSyncHealth)
  }, [])

  return { syncHealth, recordSyncSuccess, recordSyncFailure, resetSyncHealth }
}
