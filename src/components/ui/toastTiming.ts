import type { ToastMessage } from '../../app/types'

/** 행동 버튼이 없는 성공·안내 토스트 */
export const TOAST_DURATION_MS = 3000
/** ‘되돌리기’처럼 행동 버튼이 있는 토스트 */
export const TOAST_ACTION_DURATION_MS = 5000

export function toastDuration(toast: Pick<ToastMessage, 'tone' | 'action' | 'persistent'>): number | null {
  // 오류·경고와 사용자가 직접 확인해야 하는 안내는 닫을 때까지 남긴다.
  if (toast.persistent || toast.tone === 'error' || toast.tone === 'warning') return null
  return toast.action ? TOAST_ACTION_DURATION_MS : TOAST_DURATION_MS
}
