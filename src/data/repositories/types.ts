import type {
  Announcement,
  AppData,
  DutyMajorCategory,
  MemberStatusKind,
  Product,
  ProductCategory,
  Profile,
  Project,
  ReadMarkSection,
  ReviewStatus,
  Role,
} from '../../types'
import type {
  AnnouncementPayload,
  AuditedDeleteInput,
  ChangeApplicationInput,
  FinalizeChangeApplicationInput,
  ProjectInput,
  UndoFinalizeChangeApplicationInput,
  ReviewRequestPayload,
} from '../contracts'
import type { OfficeSeatInput } from '../validation/officeSeats'
import type { MemberLeaveInput } from '../validation/memberPresence'
import type { OfficeMeetingStartInput } from '../validation/officeMeeting'
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
  reassignProductTasks(taskIds: string[], assigneeId: string, reason: string): Promise<void>
  removeProductChangeScope(taskId: string, reason: string): Promise<void>
  cancelProductTask(taskId: string, reason: string): Promise<void>
  restoreProductChangeScope(taskId: string, reason: string): Promise<void>
  cancelChangeApplication(changeApplicationId: string, reason: string): Promise<void>
  finalizeChangeApplication(input: FinalizeChangeApplicationInput): Promise<void>
  undoFinalizeChangeApplication(input: UndoFinalizeChangeApplicationInput): Promise<void>
  /** @deprecated Compatibility path until all UI callers use finalizeChangeApplication. */
  archiveChangeApplication(changeApplicationId: string, reason: string): Promise<void>
  /** @deprecated Compatibility path for legacy archived records only. */
  restoreChangeApplication(changeApplicationId: string, reason: string): Promise<void>
}

export type OfficeRepository = {
  /** 자리 배치 전체를 revision 비교 후 교체한다. 바뀐 게 없으면 changed가 false다. */
  replaceOfficeSeats(input: { seats: OfficeSeatInput[]; expectedRevision: string | null }): Promise<{ changed: boolean }>
}

export type OfficeMeetingRepository = {
  /** 회의실을 열고 사무실에 앉은 사람을 부른다. 회의실이 사용 중이면 실패한다. */
  startMeeting(input: OfficeMeetingStartInput): Promise<void>
  /** 부름을 받은 내가 확인했다고 체크한다. */
  acknowledgeMeeting(meetingId: string): Promise<void>
  /** 회의를 끝내고 지운다(연 사람·파트장). 이미 끝났으면 ended가 false다. */
  endMeeting(meetingId: string): Promise<{ ended: boolean }>
}

export type PresenceRepository = {
  /** 잠깐 비운 상태를 바꾸거나(status) 지운다(null). 내 상태, 또는 파트장이 파트장·파트원 상태를 바꾼다. */
  setStatus(profileId: string, status: MemberStatusKind | null): Promise<void>
  /** 휴가·출장 기간을 등록한다. 같은 사람의 다른 기간과 겹치면 실패한다. */
  addLeave(input: MemberLeaveInput): Promise<void>
  /** 휴가·출장을 취소한다. 이미 없으면 removed가 false다. */
  deleteLeave(leaveId: string): Promise<{ removed: boolean }>
}

export type ReadMarkRepository = {
  /** 이 화면에서 지금 보이는 항목을 ‘확인함’으로 기록한다. 내 기록만 바뀐다. */
  markSectionSeen(section: ReadMarkSection, keys: readonly string[]): Promise<void>
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
  office: OfficeRepository
  readMarks: ReadMarkRepository
  meetings: OfficeMeetingRepository
  presence: PresenceRepository
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
