import type { Dispatch, SetStateAction } from 'react'
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
  ChangeApplicationInput,
  ProjectInput,
  ReviewRequestPayload,
} from '../contracts'

export type ReviewRepository = {
  saveReviewRequest(input: {
    editingReviewId: string | null
    payload: ReviewRequestPayload
  }): Promise<{ reviewId: string; isUpdate: boolean }>
  withdrawReviewRequest(requestId: string): Promise<void>
  rejectReviewRequest(requestId: string, comment: string): Promise<void>
  updateReviewStatus(requestId: string, status: ReviewStatus): Promise<void>
  reopenReviewRequest(requestId: string): Promise<void>
  resubmitReviewRequest(requestId: string, comment: string): Promise<void>
  addReviewFeedback(requestId: string, comment: string): Promise<string | null>
  updateReviewFeedback(feedbackId: string, comment: string): Promise<void>
  deleteReviewFeedback(feedbackId: string): Promise<void>
}

export type ProjectRepository = {
  createProject(input: {
    project: ProjectInput
    memberIds: string[]
    memberOptions: Profile[]
  }): Promise<string | null>
  updateProject(projectId: string, updated: ProjectInput): Promise<void>
  saveProjectAssignments(input: {
    project: Project
    nextMemberIds: string[]
    memberOptions: Profile[]
  }): Promise<void>
  deleteProject(project: Project): Promise<void>
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

export type MasterRepository = {
  importProducts(products: Array<{
    name: string
    category: ProductCategory | string
    company_name: string
    sort_order: number | null
  }>): Promise<void>
  importInvites(invites: Array<{ email: string; name: string; role: Role }>): Promise<void>
  addAllowedUser(input: { email: string; name: string; role: Role }): Promise<void>
  addProduct(product: {
    name: string
    category: ProductCategory | string
    company_name: string
    sort_order: number | null
  }): Promise<void>
  addDutyMajorCategory(payload: { name: string; sort_order: number | null }): Promise<void>
  addDuty(payload: { major_category_id: string; name: string; sort_order: number | null }): Promise<void>
  saveProductAssignments(input: {
    productId: string
    nextMemberIds: string[]
    unassignedReason: string | null
    product?: Product | null
    memberOptions?: Array<{ id: string; name: string; email: string }>
  }): Promise<void>
  saveDutyAssignments(input: {
    dutyId: string
    nextMemberIds: string[]
    duty?: {
      name: string
      major_category_id: string
      duty_major_categories?: DutyMajorCategory | Pick<DutyMajorCategory, 'name' | 'sort_order'> | null
    } | null
    memberOptions?: Array<{ id: string; name: string; email: string }>
  }): Promise<void>
  assignProduct(input: {
    userId: string
    productId: string
    transferPending: boolean
    transferReason: string | null
  }): Promise<MasterProductAssignmentResult>
  assignDuty(input: { userId: string; dutyId: string }): Promise<boolean>
  updateProduct(productId: string, payload: {
    name: string
    category?: ProductCategory | string | null
    company_name?: string | null
    unassigned_reason?: string | null
    sort_order?: number | null
  }): Promise<void>
  updateDutyMajorCategory(
    majorCategoryId: string,
    payload: { name: string; sort_order?: number | null },
  ): Promise<void>
  updateDuty(
    dutyId: string,
    payload: { name: string; major_category_id: string; sort_order?: number | null },
  ): Promise<void>
  updateInvite(inviteId: string, payload: { email: string; name: string; role: Role }): Promise<void>
  toggleProfileActive(profileId: string, nextActive: boolean): Promise<void>
  deleteAllowedUser(id: string): Promise<string | null>
  deleteProduct(id: string): Promise<string | null>
  deleteDuty(id: string): Promise<string | null>
  deleteDutyMajorCategory(id: string): Promise<string | null>
}

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
  cancelChangeApplication(changeApplicationId: string, reason: string): Promise<void>
}

/** local·remote repository가 공통으로 받는 의존성 (RepositoryContext에서 isRemote를 뺀 형태). */
export type RepositoryDeps = {
  profile: Profile
  data: AppData
  setData: Dispatch<SetStateAction<AppData>>
}
