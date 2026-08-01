import type {
  ActivityLog,
  AllowedUser,
  Announcement,
  ChangeActionItem,
  ChangeApplication,
  ChangeApplicationSummary,
  ChangeAssigneeOption,
  ChangeProductScopeRow,
  Duty,
  DutyAssignment,
  DutyMajorCategory,
  Product,
  ProductAssignment,
  Profile,
  ProfileNote,
  Project,
  ProjectAssignment,
  ReviewRequest,
  ReviewEvent,
  ReviewReadReceipt,
  AuditEvent,
  ProductChangeTask,
} from './domain'

export interface AppData {
  announcements: Announcement[]
  changeApplications: ChangeApplication[]
  changeApplicationSummaries?: ChangeApplicationSummary[]
  changeActionItems: ChangeActionItem[]
  productChangeTasks: ProductChangeTask[]
  changeProductScope: ChangeProductScopeRow[]
  changeAssigneeOptions: ChangeAssigneeOption[]
  profiles: Profile[]
  allowedUsers: AllowedUser[]
  products: Product[]
  dutyMajorCategories: DutyMajorCategory[]
  duties: Duty[]
  productAssignments: ProductAssignment[]
  dutyAssignments: DutyAssignment[]
  reviewRequests: ReviewRequest[]
  /** Optional slices retain their last good snapshot when a secondary query fails. */
  reviewEvents?: ReviewEvent[]
  reviewReadReceipts?: ReviewReadReceipt[]
  auditEvents?: AuditEvent[]
  projects: Project[]
  projectAssignments: ProjectAssignment[]
  profileNotes: ProfileNote[]
  activityLogs: ActivityLog[]
}
