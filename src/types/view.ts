import type {
  ActivityLog,
  AllowedUser,
  Announcement,
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
} from './domain'

export interface AppData {
  announcements: Announcement[]
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
