import type { ActivityLogInput } from '../../domain/activityLog'

export type { ActivityLogInput } from '../../domain/activityLog'

export interface ActivityLogWriter {
  write(input: ActivityLogInput): Promise<void>
}
