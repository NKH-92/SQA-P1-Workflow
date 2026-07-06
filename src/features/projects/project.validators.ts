import { UserFacingError } from '../../lib/errors'
import type { ProjectStatus } from '../../types'

export function validateProjectCreate(input: {
  name: string
  description: string
  deadline: string
  status: ProjectStatus
}) {
  const name = input.name.trim()
  if (!name) throw new UserFacingError('프로젝트명을 입력해 주세요.')
  return {
    name,
    description: input.description.trim(),
    deadline: input.deadline || null,
    status: input.status,
  }
}
