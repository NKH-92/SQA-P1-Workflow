import type { Dispatch, SetStateAction } from 'react'
import type { AppData, Profile, Project, ReviewStatus } from '../../types'
import type { ReviewRequestPayload, ProjectInput } from '../local/appDataReducers'

export type ReviewRepository = {
  saveReviewRequest(input: {
    editingReviewId: string | null
    payload: ReviewRequestPayload
  }): Promise<{ reviewId: string; isUpdate: boolean }>
  withdrawReviewRequest(requestId: string): Promise<void>
  rejectReviewRequest(requestId: string, comment: string): Promise<void>
  updateReviewStatus(requestId: string, status: ReviewStatus): Promise<void>
  reopenReviewRequest(requestId: string): Promise<void>
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

export type MasterRepository = {
  deleteAllowedUser(id: string): Promise<void>
  deleteProduct(id: string): Promise<void>
  deleteDuty(id: string): Promise<void>
  deleteDutyMajorCategory(id: string): Promise<void>
}

/** local·remote repository가 공통으로 받는 의존성 (RepositoryContext에서 isRemote를 뺀 형태). */
export type RepositoryDeps = {
  profile: Profile
  data: AppData
  setData: Dispatch<SetStateAction<AppData>>
}
