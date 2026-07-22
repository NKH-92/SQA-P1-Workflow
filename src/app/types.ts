import type { ReviewStatus } from '../types'

export type { TabId } from '../lib/navigation'

export type MasterTabId = 'products' | 'duties' | 'invites'
export type ReviewStatusFilter = 'all' | ReviewStatus
export type ToastMessage = { text: string; tone: 'success' | 'error' | 'warning' }
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
  success: string | (() => string),
) => Promise<boolean>
