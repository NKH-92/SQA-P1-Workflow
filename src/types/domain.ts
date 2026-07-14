export type Role = 'leader' | 'member'
export type ReviewStatus = 'pending' | 'approved' | 'rejected'
export type ProjectStatus = 'planned' | 'in_progress' | 'done'
export type ProductCategory = '자사' | '위탁'
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
  leader_id: string
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
