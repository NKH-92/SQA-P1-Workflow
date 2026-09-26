import type { ReviewStatus } from '../types'

export type { TabId } from '../lib/navigation'

export type MasterTabId = 'products' | 'duties' | 'invites'
export type ReviewStatusFilter = 'all' | ReviewStatus
export type ToastTone = 'success' | 'error' | 'warning' | 'info'
/** 토스트 안의 행동 버튼(예: 되돌리기). 누르면 토스트는 닫힌다. */
export type ToastAction = { label: string; onClick: () => void }
/** 성공 토스트의 내용. persistent면 사용자가 닫을 때까지 남는다(임시 비밀번호 안내 등). */
export type ToastSpec = { text: string; action?: ToastAction; persistent?: boolean }
export type ToastInput = ToastSpec & { tone: ToastTone }
export type ToastMessage = ToastInput & { id: number }
export type SetToast = (message: ToastInput | null) => void
export type AdminDeleteTable =
  | 'allowed_users'
  | 'products'
  | 'duties'
  | 'duty_major_categories'
  | 'projects'
export type PendingAdminDelete = {
  table: AdminDeleteTable
  id: string
  expectedUpdatedAt: string | null
}
export type DeadlineMode = 'date' | 'none'

export type MutateFn = (
  operation: () => Promise<void>,
  success: string | ToastSpec | (() => string | ToastSpec),
) => Promise<boolean>
