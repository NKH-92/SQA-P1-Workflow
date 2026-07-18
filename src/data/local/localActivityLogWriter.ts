import { makeId } from '../../lib/format'
import type { ActivityLog } from '../../types'
import type { AppDataUpdater } from '../repositories/appDataUpdater'
import type { ActivityLogWriter } from '../repositories/activityLogWriter'

export function createLocalActivityLogWriter(setData: AppDataUpdater): ActivityLogWriter {
  return {
    async write(input) {
      const item: ActivityLog = {
        id: makeId('activity'),
        actor_id: input.actor.id,
        target_user_id: input.targetUserId ?? null,
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        action: input.action,
        summary: input.summary,
        metadata: input.metadata ?? {},
        created_at: new Date().toISOString(),
      }
      setData((current) => ({
        ...current,
        activityLogs: [item, ...current.activityLogs].slice(0, 40),
      }))
    },
  }
}
