import { useCallback, useEffect, useRef, useState } from 'react'
import { toUserMessage } from '../../lib/errors'
import { reportError } from '../../lib/errorReporter'
import type { ErrorReportRole } from '../../lib/errorReporter'
import { supabase } from '../../lib/supabase'
import type { SetToast, ToastInput, ToastMessage, ToastSpec } from '../types'

/**
 * success는 보통 고정 문구지만, no-op처럼 operation 실행 결과에 따라 달라지는 문구가
 * 필요하면 함수로 넘길 수 있다 — mutate() 인자 평가 시점이 아니라 operation() 성공
 * 직후에 호출되므로, 클로저로 캡처한 결과 플래그를 그때 읽을 수 있다.
 * 토스트에 ‘되돌리기’ 같은 행동이 필요하거나 사용자가 닫을 때까지 남겨야 하면
 * `{ text, action, persistent }` 모양(ToastSpec)으로 넘긴다.
 */
export type MutationSuccess = string | ToastSpec | (() => string | ToastSpec)

export type MutationRunner = (
  operation: () => Promise<void>,
  success: MutationSuccess,
) => Promise<boolean>

export type MutationErrorReportContext = { role: ErrorReportRole; route: string }

const defaultReportContext = (): MutationErrorReportContext => ({ role: 'unknown', route: 'unknown' })

/** 한 번에 보이는 토스트 수. 오래된 것부터 밀려난다. */
export const MAX_VISIBLE_TOASTS = 3

function resolveSuccess(success: MutationSuccess): ToastSpec {
  const value = typeof success === 'function' ? success() : success
  return typeof value === 'string' ? { text: value } : value
}

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
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const inFlightRef = useRef(false)
  const toastSeqRef = useRef(0)
  const getReportContextRef = useRef(getReportContext)
  useEffect(() => {
    getReportContextRef.current = getReportContext
  })

  /**
   * null이면 사용자가 닫을 때까지 남기는 토스트(persistent)만 남기고 모두 지운다.
   * 같은 문구·같은 성격의 토스트가 이미 있으면 새로 쌓지 않고 맨 뒤로 옮겨 타이머를 다시 시작한다.
   */
  const setMessage = useCallback<SetToast>((input: ToastInput | null) => {
    if (input == null) {
      setToasts((current) => current.filter((toast) => toast.persistent))
      return
    }
    toastSeqRef.current += 1
    const next: ToastMessage = { ...input, id: toastSeqRef.current }
    setToasts((current) => [
      ...current.filter((toast) => !(toast.text === input.text && toast.tone === input.tone)),
      next,
    ].slice(-MAX_VISIBLE_TOASTS))
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const mutate = useCallback<MutationRunner>(
    async (operation: () => Promise<void>, success: MutationSuccess): Promise<boolean> => {
      // Re-entrancy guard: a second submit (double-click / Ctrl+Enter + click) while one
      // is in flight is ignored, so we never insert the same record twice. The guard spans
      // both the operation and its post-op refresh. The drop must never be silent — the
      // user has no other signal that their click was discarded.
      if (inFlightRef.current) {
        setMessage({ text: '이전 작업을 처리하는 중이에요. 끝나면 다시 시도해 주세요.', tone: 'warning' })
        return false
      }
      inFlightRef.current = true
      setSaving(true)
      setMessage(null)
      try {
        try {
          await operation()
        } catch (error) {
          const { text } = resolveSuccess(success)
          setMessage({ text: toUserMessage(error), tone: 'error' })
          const { role, route } = getReportContextRef.current()
          reportError({ error, role, route, operation: text })
          return false
        }
        // The operation succeeded — only now is it safe to resolve a success() closure,
        // since it may read a result flag (e.g. no-op) that operation() just set.
        const spec = resolveSuccess(success)
        // A failure of the post-op refresh must NOT be reported as a failed operation —
        // that would make the user retry and create a duplicate.
        if (supabase) {
          try {
            await refreshData()
          } catch {
            setMessage({
              text: `${spec.text} 다만 목록을 새로 불러오지 못했어요. 새로고침 버튼을 눌러 주세요.`,
              tone: 'warning',
            })
            return true
          }
        }
        setMessage({ ...spec, tone: 'success' })
        return true
      } finally {
        inFlightRef.current = false
        setSaving(false)
      }
    },
    [refreshData, setMessage],
  )

  const message = toasts.length > 0 ? toasts[toasts.length - 1] : null

  return { saving, message, toasts, setMessage, dismissToast, mutate }
}
