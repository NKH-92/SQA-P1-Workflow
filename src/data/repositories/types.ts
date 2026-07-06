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
  addReviewFeedback(requestId: string, comment: string): Promise<string | null>
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
  deleteProductAssignment(id: string): Promise<void>
  deleteDutyAssignment(id: string): Promise<void>
}

export type LocalRepositoryContext = {
  profile: Profile
  data: AppData
  setData: Dispatch<SetStateAction<AppData>>
}
