import type {
  ChangeActionKind,
  ChangeApplicationSource,
  ProjectStatus,
} from '../types'

export type AnnouncementPayload = {
  title: string
  body: string
  is_pinned: boolean
}

export type ReviewRequestPayload = {
  title: string
  description: string
  due_date: string | null
}

export type ProjectInput = {
  name: string
  description: string
  deadline: string | null
  status: ProjectStatus
}

/** Revision and operator-authored reason captured when a destructive action is opened. */
export type AuditedDeleteInput = {
  expectedUpdatedAt: string | null
  reason: string
}

export type ChangeTaskDraft = {
  product_id: string
  assignee_id: string | null
  product_note?: string | null
}

export type ChangeApplicationInput = {
  changeApplicationId: string | null
  expected_updated_at: string | null
  change_number: string
  source: ChangeApplicationSource
  title: string
  summary: string
  source_url: string | null
  effective_date: string
  action_kind: ChangeActionKind
  custom_kind_name: string | null
  action_content: string
  due_date: string
  tasks: ChangeTaskDraft[]
}
