export type Role = 'leader' | 'team_leader' | 'member'
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'
export type ReviewEventType =
  | 'submitted'
  | 'resubmitted'
  | 'approved'
  | 'rejected'
  | 'reopened'
  | 'withdrawn'
  | 'feedback_added'
  | 'feedback_updated'
  | 'feedback_voided'
export type ProjectStatus = 'planned' | 'in_progress' | 'done'
export type ProductCategory = '자사' | '위탁'
export type ChangeApplicationSource = 'official' | 'internal' | 'other'
export type ChangeApplicationStatus = 'draft' | 'published' | 'cancelled'
export type ChangeApplicationWorkflowStatus =
  | 'draft'
  | 'in_progress'
  | 'final_review_ready'
  | 'completed'
  | 'cancelled'
  | 'legacy_completed'
export type ChangeApplicationHistoryResult = 'completed' | 'cancelled' | 'legacy_auto' | 'legacy_manual'
export type ChangeActionKind = 'product_standard' | 'other'
export type ProductChangeTaskStatus = 'pending' | 'completed' | 'not_applicable' | 'cancelled'
export type ActivityEntityType =
  | 'review_request'
  | 'review_feedback'
  | 'project'
  | 'project_assignment'
  | 'product_assignment'
  | 'duty_assignment'
  | 'allowed_user'
  | 'profile_note'
  | 'product'
  | 'duty'
  | 'duty_major_category'
  | 'change_application'
  | 'change_action_item'
  | 'product_change_task'

export interface Profile {
  id: string
  email: string
  name: string
  role: Role
  is_active?: boolean
  created_at?: string
  updated_at?: string
  must_change_password?: boolean
}

export interface AllowedUser {
  id: string
  email: string
  name: string
  role: Role
  created_at?: string
  updated_at?: string
}

export interface Product {
  id: string
  name: string
  category?: ProductCategory | string | null
  company_name?: string | null
  unassigned_reason?: string | null
  sort_order?: number | null
  created_at?: string
  updated_at?: string
}

export interface DutyMajorCategory {
  id: string
  name: string
  sort_order?: number | null
  created_at?: string
  updated_at?: string
}

export interface Duty {
  id: string
  name: string
  major_category_id: string
  sort_order?: number | null
  assignee_label?: string | null
  notes?: string | null
  created_at?: string
  updated_at?: string
  duty_major_categories?: Pick<DutyMajorCategory, 'name' | 'sort_order'> | null
}

export interface ProductAssignment {
  id: string
  user_id: string
  product_id: string
  created_at?: string
  updated_at?: string
  profiles?: Pick<Profile, 'name' | 'email'> | null
  products?: Pick<Product, 'name' | 'category' | 'company_name' | 'sort_order'> | null
}

export interface DutyAssignment {
  id: string
  user_id: string
  duty_id: string
  created_at?: string
  profiles?: Pick<Profile, 'name' | 'email'> | null
  duties?: Pick<Duty, 'name' | 'major_category_id'> & {
    duty_major_categories?: Pick<DutyMajorCategory, 'name'> | null
  } | null
}

export interface ReviewFeedback {
  id: string
  review_request_id: string
  /** Legacy DB column name; represents the feedback author id. */
  leader_id: string
  author_role?: Role
  comment: string
  created_at?: string
  updated_at?: string
  voided_at?: string | null
  voided_by?: string | null
  void_reason?: string | null
  profiles?: Pick<Profile, 'name'> | null
}

export interface ReviewRequest {
  id: string
  requester_id: string
  title: string
  description: string
  due_date: string | null
  status: ReviewStatus
  review_round?: number
  rejection_count?: number
  last_submitted_at?: string
  status_changed_at?: string
  closed_at?: string | null
  withdrawn_at?: string | null
  withdrawn_by?: string | null
  withdrawal_reason?: string | null
  created_at?: string
  updated_at?: string
  profiles?: Pick<Profile, 'name' | 'email'> | null
  review_feedback?: ReviewFeedback[]
}

export type ReviewTerminalStatus = Exclude<ReviewStatus, 'pending'>

export type ReviewHistoryFilters = {
  status: ReviewTerminalStatus | null
  query: string
  from: string | null
  to: string | null
}

export type ReviewHistoryCursor = {
  terminal_at: string
  id: string
}

export interface ReviewHistoryRow extends ReviewRequest {
  status: ReviewTerminalStatus
  terminal_at: string
}

export type ReviewHistoryPage = {
  schema_version: 1
  snapshot_at: string
  rows: ReviewHistoryRow[]
  has_more: boolean
  next_cursor: ReviewHistoryCursor | null
}

export interface ReviewEvent {
  id: string | number
  review_request_id: string
  actor_id: string | null
  actor_name_snapshot: string
  event_type: ReviewEventType
  from_status: ReviewStatus | null
  to_status: ReviewStatus | null
  occurred_at: string
  metadata: Record<string, unknown>
  transaction_id: string | number
}

export interface ReviewReadReceipt {
  user_id: string
  review_request_id: string
  last_seen_event_id: string | number
  read_at: string
}

/** Shared shape for public.get_review_statistics_v2 (remote) and its local-preview parity builder. */
export type ReviewStatisticsV2MonthRow = {
  month: string
  business_date: string
  backlog_count: number
}

export type ReviewStatisticsV2MonthlyBreakdownRow = {
  month: string
  new_requests: number
  resubmissions: number
  approvals: number
  rejections: number
  month_end_backlog: number
}

export type ReviewStatisticsV2RequesterRow = {
  requester_id: string
  requester_name: string
  requester_inactive: boolean
  new_requests: number
  resubmissions: number
  approvals: number
  rejections: number
  pending_count: number
}

export type ReviewStatisticsV2Envelope = {
  schema_version: 2
  timezone: 'Asia/Seoul'
  generated_at: string
  from: string
  to: string
  requester_id: string | null
  status: ReviewStatus | null
  new_requests: number
  resubmissions: number
  approvals: number
  rejections: number
  pending_count: number
  requester_breakdown: ReviewStatisticsV2RequesterRow[]
  month_end_backlog: ReviewStatisticsV2MonthRow[]
  monthly_breakdown: ReviewStatisticsV2MonthlyBreakdownRow[]
}

export type ReviewStatisticsV2Params = {
  from: string
  to: string
  requesterId?: string | null
  status?: ReviewStatus | null
}

/**
 * Shared envelope shape returned by every one-transaction-snapshot
 * bootstrap RPC (`get_core_bootstrap_v2`, `get_change_bootstrap_v2`, and the
 * `get_review_bootstrap_v2` in spirit). `warnings` reports a
 * server-detected partial condition inside an otherwise-successful snapshot,
 * such as a bounded startup collection exceeding its display cap.
 */
export type BootstrapEnvelope<T> = {
  schema_version: number
  snapshot_at: string
  data: T
  warnings: string[]
}

/** public.get_core_bootstrap_v2 payload — profile/product/duty/assignment/project reference data. */
export type CoreBootstrapV2Data = {
  profiles: Profile[]
  leader_profiles: Array<Pick<Profile, 'id' | 'name'>>
  products: Product[]
  duty_major_categories: DutyMajorCategory[]
  duties: Duty[]
  product_assignments: ProductAssignment[]
  duty_assignments: DutyAssignment[]
  projects: Project[]
  project_assignments: ProjectAssignment[]
}

export type CoreBootstrapV2Envelope = BootstrapEnvelope<CoreBootstrapV2Data>

/** public.get_change_bootstrap_v2 payload — change application/action/bounded task/scope/assignee. */
export type ChangeBootstrapV2Data = {
  change_applications: ChangeApplication[]
  change_action_items: ChangeActionItem[]
  product_change_tasks: ProductChangeTask[]
  change_product_scope: ChangeProductScopeRow[]
  change_assignee_options: ChangeAssigneeOption[]
}

export type ChangeBootstrapV2Envelope = BootstrapEnvelope<ChangeBootstrapV2Data>

export type ChangeApplicationSummary = {
  change_application_id: string
  workflow_status: ChangeApplicationWorkflowStatus
  total_count: number
  pending_count: number
  completed_count: number
  not_applicable_count: number
  scope_removed_count: number
  unresolved_cancelled_count: number
  unassigned_count: number
  processed_count: number
  percent: number
  can_finalize: boolean
}

/** public.get_change_bootstrap_v3 payload. */
export type ChangeBootstrapV3Data = ChangeBootstrapV2Data & {
  application_summaries: ChangeApplicationSummary[]
}

export type ChangeBootstrapV3Envelope = BootstrapEnvelope<ChangeBootstrapV3Data>

export type ChangeApplicationHistoryFilters = {
  result: ChangeApplicationHistoryResult | null
  query: string
  from: string | null
  to: string | null
  product_id: string | null
  assignee_id: string | null
}

export type ChangeApplicationHistoryCursor = {
  history_at: string
  id: string
}

export interface ChangeApplicationHistoryRow extends ChangeApplication {
  history_result: ChangeApplicationHistoryResult
  history_at: string
  application_summary: ChangeApplicationSummary
  product_tasks: ProductChangeTask[]
}

export type ChangeApplicationHistoryPage = {
  schema_version: 1
  snapshot_at: string
  rows: ChangeApplicationHistoryRow[]
  has_more: boolean
  next_cursor: ChangeApplicationHistoryCursor | null
}

export interface Project {
  id: string
  name: string
  description: string
  deadline: string | null
  status: ProjectStatus
  created_by: string
  created_at?: string
  updated_at?: string
}

export interface ProjectAssignment {
  id: string
  project_id: string
  user_id: string
  notes: string | null
  created_at?: string
  updated_at?: string
  profiles?: Pick<Profile, 'name' | 'email'> | null
  projects?: Pick<Project, 'name' | 'description' | 'deadline' | 'status'> | null
}

export interface ProfileNote {
  id: string
  profile_id: string
  leader_id: string
  note: string
  created_at?: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  is_pinned: boolean
  pinned_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

/** 홈 도트 사무실 캐릭터의 성별. 파트장이 자리마다 고른다. */
export type OfficeGender = 'male' | 'female'

/** public.get_office_seats가 돌려주는 자리 한 칸. 활성 계정만 들어 있다. */
export interface OfficeSeat {
  /** 1~4는 창가 쪽 줄, 5~8은 통로 쪽 줄 */
  seat_index: number
  profile_id: string
  name: string
  /** 앉은 사람의 역할. 팀장(읽기 전용)은 회의에 부를 수 없다. 예전 응답에는 없을 수 있다. */
  role?: Role
  gender: OfficeGender
  /** 스타일과 개성을 정하는 0 이상 2^31 미만 정수 */
  style_seed: number
}

export interface OfficeLayout {
  /** 배치 전체의 내용 revision. 저장할 때 그대로 돌려보내 동시 수정을 막는다. 아직 모르면 null */
  revision: string | null
  seats: OfficeSeat[]
}

export interface OfficeMeetingParticipant {
  user_id: string
  /** 초대할 때의 이름(파트원은 다른 사람 프로필을 못 읽어 이름을 함께 둔다) */
  name: string
  /** 확인한 때. 아직이면 null. 회의를 연 사람은 열 때 확인한 것으로 친다. */
  acknowledged_at: string | null
}

/** 홈 사무실 회의실에 열린 인스턴트 회의(public.get_office_meeting). 한 번에 하나이고, 끝나면 지워진다. */
export interface OfficeMeeting {
  id: string
  title: string
  organizer_id: string
  organizer_name: string
  /** 회의를 연(예약한) 때 */
  created_at: string
  /** 회의 시작 시각. 지금 바로 연 회의는 연 때와 같고, 그 밖에는 오늘 안의 시각이다. */
  starts_at: string
  /** 회의 장소. 빈 문자열이면 사무실 회의실이다. */
  location: string
  /** 아무도 끝내지 않으면 이때 저절로 끝난다(시작 3시간 뒤). */
  expires_at: string
  participants: OfficeMeetingParticipant[]
}

/** 하루 중 잠깐 자리를 비운 상태(해제할 때까지 유지). 기본 상태(자리에 있음)는 행이 없다. */
export type MemberStatusKind = 'meeting' | 'field' | 'lab' | 'away'
/** 기간을 정해 두는 부재 */
export type MemberLeaveKind = 'vacation' | 'trip'

/** public.get_member_presence의 짧은 상태 한 줄 */
export interface MemberStatus {
  profile_id: string
  /** 조회 때의 이름(파트원은 다른 사람 프로필을 못 읽어 이름을 함께 둔다) */
  name: string
  status: MemberStatusKind
  updated_at: string
}

/** public.get_member_presence의 휴가·출장 한 건(오늘 이후에 끝나는 것만) */
export interface MemberLeave {
  id: string
  profile_id: string
  name: string
  kind: MemberLeaveKind
  /** 서울 날짜 YYYY-MM-DD(첫날·마지막 날 포함) */
  starts_on: string
  ends_on: string
  note: string
}

export interface MemberPresence {
  statuses: MemberStatus[]
  leaves: MemberLeave[]
}

/** ‘마지막으로 확인한 항목’을 사람별로 기록하는 화면. 검토요청은 review_read_receipts가 맡는다. */
export type ReadMarkSection = 'announcements' | 'projects' | 'change-applications'

/** public.get_section_read_marks가 돌려주는 내 확인 기록 한 줄 */
export interface SectionReadMark {
  user_id: string
  section: ReadMarkSection
  /** 마지막으로 이 화면을 열었을 때 있던 항목 id. 여기에 없는 항목이 새 소식이다. */
  seen_keys: string[]
  seen_at: string
}

export interface ChangeApplication {
  id: string
  change_number: string
  source: ChangeApplicationSource
  title: string
  summary: string
  source_url: string | null
  effective_date: string | null
  status: ChangeApplicationStatus
  content_locked_at?: string | null
  archived_at?: string | null
  archived_by?: string | null
  archive_reason?: string | null
  archive_origin?: 'manual' | 'automatic' | 'migration' | 'legacy_system' | null
  final_completed_at?: string | null
  final_completed_by?: string | null
  final_completed_by_name?: string | null
  final_completion_note?: string | null
  created_by: string
  published_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string
  profiles?: Pick<Profile, 'name'> | null
}

export interface ChangeActionItem {
  id: string
  change_application_id: string
  kind: ChangeActionKind
  custom_kind_name: string | null
  content: string
  due_date: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ProductChangeTask {
  id: string
  action_item_id: string
  product_id: string
  product_name: string
  assignee_id: string | null
  assignee_name: string | null
  /** Local preview parity for the server's private durable assignee ledger. */
  assignee_history_ids?: string[]
  status: ProductChangeTaskStatus
  product_note: string | null
  completion_note: string | null
  resolution_reason: string | null
  cancel_kind?: 'scope_removed' | 'manual' | 'application_cancelled' | 'legacy' | null
  cancelled_at?: string | null
  cancelled_by?: string | null
  restored_at?: string | null
  restored_by?: string | null
  restore_reason?: string | null
  proxy_reason: string | null
  completed_by: string | null
  completed_by_name: string | null
  completed_at: string | null
  reopened_by: string | null
  reopened_by_name: string | null
  reopened_at: string | null
  reopen_reason: string | null
  created_at: string
  updated_at: string
  products?: Pick<Product, 'name' | 'category' | 'company_name' | 'sort_order'> | null
}

/** 등록 화면에만 노출하는 최소 제품·배정 디렉터리 행. */
export interface ChangeProductScopeRow {
  product_id: string
  product_name: string
  category: string | null
  company_name: string | null
  sort_order: number | null
  assignee_id: string | null
  assignee_name: string | null
}

/** 일반 사용자에게 이메일 없이 노출하는 적용업무 책임자 후보. */
export interface ChangeAssigneeOption {
  id: string
  name: string
  role: Role
}

export interface ActivityLog {
  id: string
  actor_id: string
  target_user_id: string | null
  entity_type: ActivityEntityType
  entity_id: string | null
  action: string
  summary: string
  metadata?: Record<string, unknown>
  created_at?: string
}

export interface AuditEvent {
  id: string
  entity_type: string
  entity_id: string | null
  action: 'inserted' | 'updated' | 'deleted'
  actor_id: string | null
  actor_name: string | null
  changed_fields: string[]
  before_delta: Record<string, unknown>
  after_delta: Record<string, unknown>
  reason: string | null
  source: string
  changed_at: string
}
