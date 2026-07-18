import type { ActivityLogInput, ActivityLogWriter } from './repositories/activityLogWriter'

export async function recordActivityLog(writer: ActivityLogWriter, input: ActivityLogInput) {
  await writer.write(input)
}

export type { ActivityLogInput, ActivityLogWriter }
