import type {
  ActivityLog,
  AllowedUser,
  Announcement,
  ChangeActionItem,
  ChangeApplication,
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
  ProductChangeTask,
} from './domain'

export interface AppData {
  announcements: Announcement[]
  changeApplications: ChangeApplication[]
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
  projects: Project[]
  projectAssignments: ProjectAssignment[]
  profileNotes: ProfileNote[]
  activityLogs: ActivityLog[]
}
