import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import type { ToastMessage } from '../../app/types'
import { toastDuration } from './toastTiming'

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false)
  const remainingRef = useRef<number | null>(toastDuration(toast))
  const startedAtRef = useRef(0)

  useEffect(() => {
    const remaining = remainingRef.current
    if (remaining == null || paused) return
    startedAtRef.current = Date.now()
    const timer = window.setTimeout(() => onDismiss(toast.id), remaining)
    return () => {
      window.clearTimeout(timer)
      remainingRef.current = Math.max(0, remaining - (Date.now() - startedAtRef.current))
    }
  }, [onDismiss, paused, toast.id])

  const Icon = toast.tone === 'error' || toast.tone === 'warning' ? AlertCircle : toast.tone === 'info' ? Info : CheckCircle2

  return (
    <div
      className="toast"
      data-tone={toast.tone}
      onBlur={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <Icon aria-hidden="true" className="toast-icon" size={16} />
      <span>{toast.text}</span>
      {toast.action && (
        <button
          className="toast-action"
          onClick={() => {
            toast.action?.onClick()
            onDismiss(toast.id)
          }}
          type="button"
        >
          {toast.action.label}
        </button>
      )}
      <button aria-label="알림 닫기" className="toast-close" onClick={() => onDismiss(toast.id)} type="button">
        <X aria-hidden="true" size={14} />
      </button>
    </div>
  )
}

/**
 * 전역 토스트 영역. 영역 자체는 항상 떠 있어야 보조기기가 새 메시지를 읽는다
 * (메시지와 함께 만들어진 live region은 읽히지 않을 수 있다).
 * 오류는 assertive 영역, 나머지는 polite 영역에 쌓는다.
 */
export function ToastViewport({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
  const polite = toasts.filter((toast) => toast.tone !== 'error')
  const assertive = toasts.filter((toast) => toast.tone === 'error')
  return (
    <div aria-label="알림 메시지" className="toast-viewport" role="region">
      <div aria-live="polite" className="toast-stack">
        {polite.map((toast) => <ToastItem key={toast.id} onDismiss={onDismiss} toast={toast} />)}
      </div>
      <div aria-live="assertive" className="toast-stack">
        {assertive.map((toast) => <ToastItem key={toast.id} onDismiss={onDismiss} toast={toast} />)}
      </div>
    </div>
  )
}
