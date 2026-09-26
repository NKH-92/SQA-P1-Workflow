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
import { useSyncHealth } from './useSyncHealth'

/** 부가 데이터 안내. warnings는 불러오기에 실패한 것, notices는 목록 표시 상한 같은 평상시 안내다. */
export type DataWarningReport = { warnings: string[]; notices: string[] }

/** 목록 상한 안내(assembleAppData의 listCapNotice)와 서버 부트스트랩의 잘림 안내. */
const LIST_CAP_NOTICE = /건까지만 보여요\.$/
const SERVER_TRUNCATION = /^\[(SQA_[A-Z_]+_TRUNCATED)\]\s*/
const SERVER_TRUNCATION_LABELS: Record<string, string> = {
  SQA_CHANGE_APPLICATIONS_TRUNCATED: '공통변경',
  SQA_CHANGE_ACTION_ITEMS_TRUNCATED: '변경 항목',
  SQA_PRODUCT_CHANGE_TASKS_TRUNCATED: '적용 업무',
}
const INTERNAL_CODE_PREFIX = /^\[[A-Z0-9_]+\]\s*/

/**
 * 실패와 평상시 안내를 나눈다. 목록이 상한을 넘은 것은 ‘최신이 아니다’가 아니라 정보이므로
 * 경고 배너에 넣지 않는다. 내부 코드([SQA_…])는 사용자에게 보여 주지 않는다.
 */
export function splitDataWarnings(messages: string[]): DataWarningReport {
  const warnings: string[] = []
  const notices: string[] = []
  for (const message of messages) {
    const truncation = SERVER_TRUNCATION.exec(message)
    if (truncation) {
      const cap = /([\d,]+)건만/.exec(message)?.[1]
      const label = SERVER_TRUNCATION_LABELS[truncation[1]]
      notices.push(label && cap ? `${label}: 최근 ${cap}건까지만 보여요.` : message.slice(truncation[0].length))
      continue
    }
    if (LIST_CAP_NOTICE.test(message)) notices.push(message)
    else warnings.push(message.replace(INTERNAL_CODE_PREFIX, ''))
  }
  return { warnings, notices }
}

export function useAppData(reportWarnings?: (report: DataWarningReport) => void) {
  const reportWarningsRef = useRef(reportWarnings)
  useEffect(() => {
    reportWarningsRef.current = reportWarnings
  })

  const [data, setData] = useState<AppData>(() => (isPreviewMode ? createPreviewData() : emptyData))
  const [refreshing, setRefreshing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [dataWarnings, setDataWarnings] = useState<string[]>([])
  const [dataNotices, setDataNotices] = useState<string[]>([])
  const { syncHealth, recordSyncSuccess, recordSyncFailure, resetSyncHealth } = useSyncHealth()
  // 조용한 새로고침(5분 폴링·창 복귀)마다 같은 안내가 다시 뜨지 않게 마지막으로 알린 내용을 기억한다.
  const reportedRef = useRef({ warnings: '', notices: '' })
  const generationRef = useRef(0)
  const dataRef = useRef(data)
  useEffect(() => {
    dataRef.current = data
  }, [data])

  const refreshData = useCallback(async (options?: { initial?: boolean; silent?: boolean }) => {
    if (!supabase) return
    // silent: 백그라운드 폴링·Realtime 재조회용 — 5분마다 topbar가 '갱신 중'으로 깜빡이지 않게 한다.
    const isQuiet = (options?.initial ?? false) || (options?.silent ?? false)
    // Generation token: if a newer refresh starts before this one resolves, the older
    // (possibly pre-mutation) snapshot must not overwrite the newer state.
    const generation = ++generationRef.current
    if (!isQuiet) setRefreshing(true)
    try {
      const result = await fetchAppData({ ...dataRef.current, optionalWarnings: [] })
      if (generation !== generationRef.current) return
      const { optionalWarnings, snapshotAt, ...appData } = result
      const { warnings, notices } = splitDataWarnings(optionalWarnings)
      const warningsKey = warnings.join('\n')
      const noticesKey = notices.join('\n')
      const newWarnings = warnings.length > 0 && warningsKey !== reportedRef.current.warnings
      const newNotices = notices.length > 0 && noticesKey !== reportedRef.current.notices
      reportedRef.current = { warnings: warningsKey, notices: noticesKey }
      if (newWarnings || newNotices) {
        reportWarningsRef.current?.({
          warnings: newWarnings ? warnings : [],
          notices: newNotices ? notices : [],
        })
      }
      setDataWarnings(warnings)
      setDataNotices(notices)
      setData(appData)
      // Prefer the server snapshot_at (evidence the data is actually known-good
      // as of that instant) over the client wall clock; fall back only when no
      // bootstrap reported one (e.g. preview mode has no Supabase project at all).
      setLastSyncedAt(snapshotAt ? new Date(snapshotAt) : new Date())
      recordSyncSuccess()
    } catch (error) {
      // 추월당한(superseded) 세대의 실패는 이미 최신 refresh가 진행 중이거나 끝났다는 뜻이므로
      // sync health를 오염시키지 않는다 — generation race protection과 동일한 원칙.
      if (generation === generationRef.current) recordSyncFailure(error)
      throw error
    } finally {
      // 추월당한 refresh는 자기 리셋을 건너뛰므로, 현재 세대의 완료가 initial 여부와
      // 무관하게 refreshing을 내려야 한다. initial만 예외로 두면 재로그인 initial이
      // 진행 중이던 수동 refresh를 추월했을 때 refreshing=true가 영구히 남는다.
      if (generation === generationRef.current) setRefreshing(false)
    }
  }, [recordSyncFailure, recordSyncSuccess])

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
    setDataWarnings([])
    setDataNotices([])
    reportedRef.current = { warnings: '', notices: '' }
    resetSyncHealth()
  }, [resetSyncHealth])

  return {
    data,
    setData,
    refreshing,
    lastSyncedAt,
    dataWarnings,
    dataNotices,
    syncHealth,
    refreshData,
    loadReviewRequest,
    loadAnnouncement,
    resetSyncState,
  }
}
