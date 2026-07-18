import type { ActivityEntityType, Profile } from '../../types'

export type ActivityLogInput = {
  actor: Profile
  targetUserId?: string | null
  entityType: ActivityEntityType
  entityId?: string | null
  action: string
  summary: string
  metadata?: Record<string, unknown>
}

export interface ActivityLogWriter {
  write(input: ActivityLogInput): Promise<void>
}
