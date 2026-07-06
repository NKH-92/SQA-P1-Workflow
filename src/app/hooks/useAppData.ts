import { useCallback, useState } from 'react'
import { createPreviewData } from '../../demoData'
import { fetchAppData } from '../../data/fetchAppData'
import { isPreviewMode, supabase } from '../../lib/supabase'
import type { AppData } from '../../types'
import { emptyData } from '../constants'

export function useAppData(reportWarnings?: (warnings: string[]) => void) {
  const [data, setData] = useState<AppData>(() => (isPreviewMode ? createPreviewData() : emptyData))
  const [refreshing, setRefreshing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  const refreshData = useCallback(async (options?: { initial?: boolean }) => {
    if (!supabase) return
    const isInitial = options?.initial ?? false
    if (!isInitial) setRefreshing(true)
    try {
      const result = await fetchAppData()
      const { optionalWarnings, ...appData } = result
      if (optionalWarnings.length > 0) {
        reportWarnings?.(optionalWarnings)
      }
      setData(appData)
      setLastSyncedAt(new Date())
    } finally {
      if (!isInitial) setRefreshing(false)
    }
  }, [reportWarnings])

  return { data, setData, refreshing, lastSyncedAt, refreshData }
}
