import type {
  Announcement,
  AppData,
  DutyMajorCategory,
  Product,
  ProductCategory,
  Profile,
  Project,
  ReviewStatus,
  Role,
} from '../../types'
import type {
  AnnouncementPayload,
  AuditedDeleteInput,
  ChangeApplicationInput,
  ProjectInput,
  ReviewRequestPayload,
} from '../contracts'
import type { AppDataUpdater } from './appDataUpdater'
import type { ActivityLogWriter } from './activityLogWriter'

export type ReviewRepository = {
  saveReviewRequest(input: {
    editingReviewId: string | null
    payload: ReviewRequestPayload
  }): Promise<{ reviewId: string; isUpdate: boolean }>
  withdrawReviewRequest(requestId: string, reason: string): Promise<void>
  rejectReviewRequest(requestId: string, comment: string): Promise<void>
  updateReviewStatus(requestId: string, status: ReviewStatus): Promise<void>
  reopenReviewRequest(requestId: string): Promise<void>
  resubmitReviewRequest(requestId: string, comment: string): Promise<void>
  addReviewFeedback(requestId: string, comment: string): Promise<string | null>
  updateReviewFeedback(feedbackId: string, comment: string): Promise<void>
  voidReviewFeedback(feedbackId: string, reason: string): Promise<void>
  markReviewSeen(requestId: string): Promise<void>
  markAllRelevantReviewsSeen(): Promise<void>
}

export type ProjectRepository = {
  createProject(input: {
    project: ProjectInput
    memberIds: string[]
    memberOptions: Profile[]
  }): Promise<string | null>
  updateProject(projectId: string, updated: ProjectInput, expectedUpdatedAt: string | null): Promise<void>
  saveProjectAssignments(input: {
    project: Project
    nextMemberIds: string[]
    memberOptions: Profile[]
  }): Promise<void>
  deleteProject(project: Project, input: AuditedDeleteInput): Promise<void>
}

export type MasterProductAssignmentResult =
  | { kind: 'noop' }
  | { kind: 'server-audited' }
  | {
      kind: 'changed'
      action: 'created' | 'updated'
      assigneeName: string
      includeTransferredTaskCount: boolean
      transferredTasks: Array<{
        id: string
        productName: string
        fromAssigneeId: string | null
      }>
    }

export type ProductAdminRepository = {
  importProducts(products: Array<{
    name: string
    category: ProductCategory | string
    company_name: string
    sort_order: number | null
  }>): Promise<void>
  addProduct(product: {
    name: string
    category: ProductCategory | string
    company_name: string
    sort_order: number | null
  }): Promise<void>
  saveProductAssignments(input: {
    productId: string
    nextMemberIds: string[]
    unassignedReason: string | null
    /** Operator-authored authoritative audit reason for the replacement. */
    reason: string
    product?: Product | null
    memberOptions?: Array<{ id: string; name: string; email: string }>
    /** OCC revision; falls back to the product snapshot already in `data` when omitted. */
    expectedUpdatedAt?: string | null
  }): Promise<{ noop: boolean }>
  assignProduct(input: {
    userId: string
    productId: string
    transferPending: boolean
    transferReason: string | null
  }): Promise<MasterProductAssignmentResult>
  /**
   * Returns `{ noop: true }` when the record already matched every
   * field in `payload` (D-05: a no-op must not produce a user-facing
   * activity-log entry, and produces no private audit row either).
   */
  updateProduct(productId: string, payload: {
    name: string
    category?: ProductCategory | string | null
    company_name?: string | null
    unassigned_reason?: string | null
    sort_order?: number | null
    /** OCC revision the editor last saw; required for the remote adapter. */
    expectedUpdatedAt: string | null
    /** Authoritative-audit change reason; required, non-blank. */
    reason: string
  }): Promise<{ noop: boolean }>
  deleteProduct(id: string, input: AuditedDeleteInput): Promise<string | null>
}

export type DutyAdminRepository = {
  addDutyMajorCategory(payload: { name: string; sort_order: number | null }): Promise<void>
  addDuty(payload: { major_category_id: string; name: string; sort_order: number | null }): Promise<void>
  saveDutyAssignments(input: {
    dutyId: string
    nextMemberIds: string[]
    /** Operator-authored authoritative audit reason for the replacement. */
    reason: string
    duty?: {
      name: string
      major_category_id: string
      duty_major_categories?: DutyMajorCategory | Pick<DutyMajorCategory, 'name' | 'sort_order'> | null
    } | null
    memberOptions?: Array<{ id: string; name: string; email: string }>
    /** OCC revision; falls back to the duty snapshot already in `data` when omitted. */
    expectedUpdatedAt?: string | null
  }): Promise<{ noop: boolean }>
  assignDuty(input: { userId: string; dutyId: string }): Promise<boolean>
  updateDutyMajorCategory(
    majorCategoryId: string,
    payload: {
      name: string
      sort_order?: number | null
      expectedUpdatedAt: string | null
      reason: string
    },
  ): Promise<{ noop: boolean }>
  updateDuty(
    dutyId: string,
    payload: {
      name: string
      major_category_id: string
      sort_order?: number | null
      assignee_label?: string | null
      notes?: string | null
      expectedUpdatedAt: string | null
      reason: string
    },
  ): Promise<{ noop: boolean }>
  deleteDuty(id: string, input: AuditedDeleteInput): Promise<string | null>
  deleteDutyMajorCategory(id: string, input: AuditedDeleteInput): Promise<string | null>
}

export type InviteAdminRepository = {
  importInvites(invites: Array<{ email: string; name: string; role: Role }>): Promise<void>
  addAllowedUser(input: { email: string; name: string; role: Role }): Promise<void>
  updateInvite(inviteId: string, payload: {
    email: string
    name: string
    role: Role
    expectedUpdatedAt: string | null
    reason: string
  }): Promise<{ noop: boolean }>
  toggleProfileActive(
    profileId: string,
    nextActive: boolean,
    input: { expectedUpdatedAt: string | null; reason: string },
  ): Promise<{ noop: boolean }>
  setProfileRole(
    profileId: string,
    role: Role,
    input: { expectedUpdatedAt: string | null; reason: string },
  ): Promise<{ noop: boolean }>
  deleteAllowedUser(id: string, input: AuditedDeleteInput): Promise<string | null>
}

/** Compatibility surface for callers that still consume the aggregate master repository. */
export type MasterRepository = ProductAdminRepository & DutyAdminRepository & InviteAdminRepository

export type AnnouncementRepository = {
  saveAnnouncement(input: {
    editingAnnouncementId: string | null
    expectedUpdatedAt: string | null
    payload: AnnouncementPayload
  }): Promise<void>
  toggleAnnouncementPin(announcement: Announcement): Promise<void>
  deleteAnnouncement(announcement: Announcement): Promise<void>
}

export type ChangeApplicationRepository = {
  saveChangeApplication(input: ChangeApplicationInput, publish: boolean): Promise<string>
  completeProductTask(taskId: string, completionNote: string, proxyReason: string): Promise<void>
  markProductTaskNotApplicable(taskId: string, reason: string, proxyReason: string): Promise<void>
  reopenProductTask(taskId: string, reason: string): Promise<void>
  reassignProductTasks(taskIds: string[], assigneeId: string | null, reason: string): Promise<void>
  cancelProductTask(taskId: string, reason: string): Promise<void>
  restoreProductChangeScope(taskId: string, reason: string): Promise<void>
  cancelChangeApplication(changeApplicationId: string, reason: string): Promise<void>
  archiveChangeApplication(changeApplicationId: string, reason: string): Promise<void>
  restoreChangeApplication(changeApplicationId: string, reason: string): Promise<void>
}

export type RepositorySet = {
  reviews: ReviewRepository
  projects: ProjectRepository
  announcements: AnnouncementRepository
  changeApplications: ChangeApplicationRepository
  products: ProductAdminRepository
  duties: DutyAdminRepository
  invites: InviteAdminRepository
  team: TeamRepository
  activityLogs: ActivityLogWriter
}

export type TeamRepository = {
  addProfileNote(input: { profileId: string; note: string }): Promise<void>
}

/** local·remote repository가 공통으로 받는 의존성 (RepositoryContext에서 isRemote를 뺀 형태). */
export type RepositoryDeps = {
  profile: Profile
  data: AppData
  setData: AppDataUpdater
  activityLogs: ActivityLogWriter
}
