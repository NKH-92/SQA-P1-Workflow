import { useCallback, useEffect, useRef, useState } from 'react'
import { createPreviewData } from '../../demoData'
import {
  fetchAnnouncementById,
  fetchAppData,
  fetchReviewRequestById,
  mergeAnnouncements,
  mergeReviewRequests,
} from '../../data/fetchAppData'
import { isPreviewMode, supabase } from '../../lib/supabase'
import type { AppData } from '../../types'
import { emptyData } from '../constants'

export function useAppData(reportWarnings?: (warnings: string[]) => void) {
  const reportWarningsRef = useRef(reportWarnings)
  useEffect(() => {
    reportWarningsRef.current = reportWarnings
  })

  const [data, setData] = useState<AppData>(() => (isPreviewMode ? createPreviewData() : emptyData))
  const [refreshing, setRefreshing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const generationRef = useRef(0)

  const refreshData = useCallback(async (options?: { initial?: boolean; silent?: boolean }) => {
    if (!supabase) return
    // silent: 백그라운드 폴링·Realtime 재조회용 — 5분마다 topbar가 '갱신 중'으로 깜빡이지 않게 한다.
    const isQuiet = (options?.initial ?? false) || (options?.silent ?? false)
    // Generation token: if a newer refresh starts before this one resolves, the older
    // (possibly pre-mutation) snapshot must not overwrite the newer state.
    const generation = ++generationRef.current
    if (!isQuiet) setRefreshing(true)
    try {
      const result = await fetchAppData()
      if (generation !== generationRef.current) return
      const { optionalWarnings, ...appData } = result
      if (optionalWarnings.length > 0) {
        reportWarningsRef.current?.(optionalWarnings)
      }
      setData(appData)
      setLastSyncedAt(new Date())
    } finally {
      // 추월당한 refresh는 자기 리셋을 건너뛰므로, 현재 세대의 완료가 initial 여부와
      // 무관하게 refreshing을 내려야 한다. initial만 예외로 두면 재로그인 initial이
      // 진행 중이던 수동 refresh를 추월했을 때 refreshing=true가 영구히 남는다.
      if (generation === generationRef.current) setRefreshing(false)
    }
  }, [])

  const loadReviewRequest = useCallback(async (requestId: string, signal?: AbortSignal): Promise<boolean | null> => {
    if (!supabase) return false
    const generation = generationRef.current
    const request = await fetchReviewRequestById(requestId, signal)
    if (generation !== generationRef.current) return null
    if (!request) return false
    setData((current) => ({
      ...current,
      reviewRequests: mergeReviewRequests(current.reviewRequests, [request]),
    }))
    return true
  }, [])

  const loadAnnouncement = useCallback(async (announcementId: string, signal?: AbortSignal): Promise<boolean | null> => {
    if (!supabase) return false
    const generation = generationRef.current
    const announcement = await fetchAnnouncementById(announcementId, signal)
    if (generation !== generationRef.current) return null
    if (!announcement) return false
    setData((current) => ({
      ...current,
      announcements: mergeAnnouncements(current.announcements, [announcement]),
    }))
    return true
  }, [])

  const resetSyncState = useCallback(() => {
    // Invalidate an in-flight response from the previous session so it cannot repopulate
    // data or make a new login look ready before its own initial refresh completes.
    generationRef.current += 1
    setRefreshing(false)
    setLastSyncedAt(null)
  }, [])

  return {
    data,
    setData,
    refreshing,
    lastSyncedAt,
    refreshData,
    loadReviewRequest,
    loadAnnouncement,
    resetSyncState,
  }
}
