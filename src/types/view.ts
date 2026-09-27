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
  OfficeLayout,
  ProfileNote,
  SectionReadMark,
  OfficeMeeting,
  MemberPresence,
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
  /** 홈 도트 사무실 자리 배치. 부가 데이터라 불러오지 못하면 이전 내용을 유지한다. */
  officeLayout?: OfficeLayout
  /**
   * 공지·프로젝트·변경 적용에서 내가 마지막으로 확인한 항목(홈 사무실 기물 알림).
   * 아직 모르면(불러오기 전·실패) undefined이고, 그동안은 ‘새 소식’ 알림을 띄우지 않는다.
   */
  sectionReadMarks?: SectionReadMark[]
  /** 지금 열린 사무실 회의. 없으면 null, 아직 모르면(불러오기 전·실패) undefined */
  officeMeeting?: OfficeMeeting | null
  /** 파트 사람들의 자리 상태(잠깐 비움·휴가·출장). 아직 모르면(불러오기 전·실패) undefined */
  memberPresence?: MemberPresence
}
