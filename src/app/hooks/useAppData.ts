import { useCallback, useEffect, useRef, useState } from 'react'
import { createPreviewData } from '../../demoData'
import { fetchAppData } from '../../data/fetchAppData'
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

  const refreshData = useCallback(async (options?: { initial?: boolean }) => {
    if (!supabase) return
    const isInitial = options?.initial ?? false
    // Generation token: if a newer refresh starts before this one resolves, the older
    // (possibly pre-mutation) snapshot must not overwrite the newer state.
    const generation = ++generationRef.current
    if (!isInitial) setRefreshing(true)
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

  return { data, setData, refreshing, lastSyncedAt, refreshData }
}
