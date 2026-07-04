export type Role = 'leader' | 'member'
export type ReviewStatus = 'pending' | 'in_review' | 'approved' | 'rejected'
export type ProjectStatus = 'planned' | 'in_progress' | 'done'

export interface Profile {
  id: string
  email: string
  name: string
  role: Role
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
  code: string | null
  created_at?: string
  updated_at?: string
}

export interface Duty {
  id: string
  name: string
  created_at?: string
  updated_at?: string
}

export interface ProductAssignment {
  id: string
  user_id: string
  product_id: string
  status: string | null
  created_at?: string
  updated_at?: string
  profiles?: Pick<Profile, 'name' | 'email'> | null
  products?: Pick<Product, 'name' | 'code'> | null
}

export interface DutyAssignment {
  id: string
  user_id: string
  duty_id: string
  created_at?: string
  profiles?: Pick<Profile, 'name' | 'email'> | null
  duties?: Pick<Duty, 'name'> | null
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

export interface AppData {
  profiles: Profile[]
  allowedUsers: AllowedUser[]
  products: Product[]
  duties: Duty[]
  productAssignments: ProductAssignment[]
  dutyAssignments: DutyAssignment[]
  reviewRequests: ReviewRequest[]
  projects: Project[]
  projectAssignments: ProjectAssignment[]
  profileNotes: ProfileNote[]
}
