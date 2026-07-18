import { useCallback, useEffect, useRef, useState } from 'react'
import { toUserMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { ToastMessage } from '../types'

export type MutationRunner = (operation: () => Promise<void>, success: string) => Promise<boolean>

export function useMutationRunner(refreshData: () => Promise<void>) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<ToastMessage | null>(null)
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 3500)
    return () => clearTimeout(timer)
  }, [message])

  const mutate = useCallback<MutationRunner>(
    async (operation: () => Promise<void>, success: string): Promise<boolean> => {
      // Re-entrancy guard: a second submit (double-click / Ctrl+Enter + click) while one
      // is in flight is ignored, so we never insert the same record twice. The guard spans
      // both the operation and its post-op refresh. The drop must never be silent — the
      // user has no other signal that their click was discarded.
      if (inFlightRef.current) {
        setMessage({ text: '이전 작업을 처리하는 중입니다. 잠시 후 다시 시도해 주세요.', tone: 'warning' })
        return false
      }
      inFlightRef.current = true
      setSaving(true)
      setMessage(null)
      try {
        try {
          await operation()
        } catch (error) {
          setMessage({ text: toUserMessage(error), tone: 'error' })
          return false
        }
        // The operation succeeded. A failure of the post-op refresh must NOT be reported as
        // a failed operation — that would make the user retry and create a duplicate.
        if (supabase) {
          try {
            await refreshData()
          } catch {
            setMessage({
              text: `${success} 다만 목록 새로고침에 실패했습니다. 새로고침 버튼을 눌러 주세요.`,
              tone: 'warning',
            })
            return true
          }
        }
        setMessage({ text: success, tone: 'success' })
        return true
      } finally {
        inFlightRef.current = false
        setSaving(false)
      }
    },
    [refreshData],
  )

  return { saving, message, setMessage, mutate }
}
