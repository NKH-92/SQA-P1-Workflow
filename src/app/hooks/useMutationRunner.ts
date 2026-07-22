import { useCallback, useEffect, useRef, useState } from 'react'
import { toUserMessage } from '../../lib/errors'
import { reportError } from '../../lib/errorReporter'
import type { ErrorReportRole } from '../../lib/errorReporter'
import { supabase } from '../../lib/supabase'
import type { ToastMessage } from '../types'

/**
 * success는 보통 고정 문구지만, no-op처럼 operation 실행 결과에 따라 달라지는 문구가
 * 필요하면 함수로 넘길 수 있다 — mutate() 인자 평가 시점이 아니라 operation() 성공
 * 직후에 호출되므로, 클로저로 캡처한 결과 플래그를 그때 읽을 수 있다.
 */
export type MutationRunner = (
  operation: () => Promise<void>,
  success: string | (() => string),
) => Promise<boolean>

export type MutationErrorReportContext = { role: ErrorReportRole; route: string }

const defaultReportContext = (): MutationErrorReportContext => ({ role: 'unknown', route: 'unknown' })

/**
 * getReportContext는 값이 아니라 getter다 — profile/leaderMode/route는 이 훅이 호출되는
 * 시점(App.tsx 최상단)보다 나중에 정해지므로, 매 렌더마다 최신 값을 담은 함수를 ref로
 * 받아 실제 오류가 날 때만 읽는다. mutate의 메모이제이션(deps: [refreshData])은 그대로 유지된다.
 */
export function useMutationRunner(
  refreshData: () => Promise<void>,
  getReportContext: () => MutationErrorReportContext = defaultReportContext,
) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<ToastMessage | null>(null)
  const inFlightRef = useRef(false)
  const getReportContextRef = useRef(getReportContext)
  useEffect(() => {
    getReportContextRef.current = getReportContext
  })

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 3500)
    return () => clearTimeout(timer)
  }, [message])

  const mutate = useCallback<MutationRunner>(
    async (operation: () => Promise<void>, success: string | (() => string)): Promise<boolean> => {
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
          const successText = typeof success === 'function' ? success() : success
          setMessage({ text: toUserMessage(error), tone: 'error' })
          const { role, route } = getReportContextRef.current()
          reportError({ error, role, route, operation: successText })
          return false
        }
        // The operation succeeded — only now is it safe to resolve a success() closure,
        // since it may read a result flag (e.g. no-op) that operation() just set.
        const successText = typeof success === 'function' ? success() : success
        // A failure of the post-op refresh must NOT be reported as a failed operation —
        // that would make the user retry and create a duplicate.
        if (supabase) {
          try {
            await refreshData()
          } catch {
            setMessage({
              text: `${successText} 다만 목록 새로고침에 실패했습니다. 새로고침 버튼을 눌러 주세요.`,
              tone: 'warning',
            })
            return true
          }
        }
        setMessage({ text: successText, tone: 'success' })
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
