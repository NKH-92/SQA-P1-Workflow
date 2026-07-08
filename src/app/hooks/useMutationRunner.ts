import { useCallback, useEffect, useState } from 'react'
import { toUserMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { ToastMessage } from '../types'

export function useMutationRunner(refreshData: () => Promise<void>) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<ToastMessage | null>(null)

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 3500)
    return () => clearTimeout(timer)
  }, [message])

  const mutate = useCallback(
    async (operation: () => Promise<void>, success: string): Promise<boolean> => {
      setSaving(true)
      setMessage(null)
      try {
        await operation()
        if (supabase) await refreshData()
        setMessage({ text: success, tone: 'success' })
        return true
      } catch (error) {
        setMessage({ text: toUserMessage(error), tone: 'error' })
        return false
      } finally {
        setSaving(false)
      }
    },
    [refreshData],
  )

  return { saving, message, setMessage, mutate }
}
