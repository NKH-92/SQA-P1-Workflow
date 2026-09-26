import type { ProjectStatus } from '../../types'
import { PROJECT_STATUS_LIFECYCLE } from './project.selectors'

export type ProjectFormState = {
  name: string
  description: string
  deadline: string
  status: ProjectStatus
}

export const emptyProjectForm: ProjectFormState = { name: '', description: '', deadline: '', status: 'planned' }

export const PROJECT_NAME_REQUIRED_MESSAGE = '프로젝트 이름을 입력해 주세요'

export function isProjectFormState(value: unknown): value is ProjectFormState {
  if (!value || typeof value !== 'object') return false
  const form = value as Record<string, unknown>
  return (
    typeof form.name === 'string'
    && typeof form.description === 'string'
    && typeof form.deadline === 'string'
    && PROJECT_STATUS_LIFECYCLE.includes(form.status as ProjectStatus)
  )
}

export function sameProjectForm(left: ProjectFormState, right: ProjectFormState) {
  return (
    left.name === right.name
    && left.description === right.description
    && left.deadline === right.deadline
    && left.status === right.status
  )
}
