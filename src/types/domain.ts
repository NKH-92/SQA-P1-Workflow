export type Role = 'leader' | 'member'
export type ReviewStatus = 'pending' | 'approved' | 'rejected'
export type ProjectStatus = 'planned' | 'in_progress' | 'done'
export type ProductCategory = '자사' | '위탁'
export type ChangeApplicationSource = 'official' | 'internal' | 'other'
export type ChangeApplicationStatus = 'draft' | 'published' | 'cancelled'
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
  profiles?: Pick<Profile, 'name'> | null
}

export interface ReviewRequest {
  id: string
  requester_id: string
  title: string
  description: string
  attachment_url: string | null
  due_date: string | null
  status: ReviewStatus
  review_round?: number
  rejection_count?: number
  last_submitted_at?: string
  created_at?: string
  updated_at?: string
  profiles?: Pick<Profile, 'name' | 'email'> | null
  review_feedback?: ReviewFeedback[]
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
  status: ProductChangeTaskStatus
  product_note: string | null
  completion_note: string | null
  resolution_reason: string | null
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
