import type { Dispatch, SetStateAction } from 'react'
import type { AppData, Profile, ReviewStatus, Role } from '../types'

export type TabId =
  | 'dashboard'
  | 'reviews'
  | 'projects'
  | 'team'
  | 'products'
  | 'duties'
  | 'invites'
  | 'work'
  | 'activity'

export type MasterTabId = 'products' | 'duties' | 'invites'
export type ReviewStatusFilter = 'all' | ReviewStatus
export type ToastMessage = { text: string; tone: 'success' | 'error' | 'warning' }
export type AdminDeleteTable =
  | 'allowed_users'
  | 'products'
  | 'duties'
  | 'duty_major_categories'
  | 'product_assignments'
  | 'duty_assignments'
export type DeadlineMode = 'date' | 'none'

export type MutateFn = (operation: () => Promise<void>, success: string) => Promise<void>

export type ScreenProps = {
  profile: Profile
  data: AppData
  mutate: MutateFn
  setData: Dispatch<SetStateAction<AppData>>
  setActiveTab: (tab: TabId, entityId?: string) => void
}

export type { Role }
