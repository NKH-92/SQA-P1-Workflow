import { supabase } from '../../lib/supabase'
import { reportError } from '../../lib/errorReporter'
import type { ActivityLogWriter } from '../repositories/activityLogWriter'

export function createSupabaseActivityLogWriter(): ActivityLogWriter {
  return {
    async write(input) {
      const { error } = await supabase!.from('activity_logs').insert({
        actor_id: input.actor.id,
        target_user_id: input.targetUserId ?? null,
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        action: input.action,
        summary: input.summary,
        metadata: input.metadata ?? {},
      })
      if (error) {
        reportError({
          error,
          route: globalThis.location?.hash || '#/unknown',
          role: input.actor.role === 'team_leader' ? 'leader' : input.actor.role,
          operation: 'activity-log-write',
          // 어떤 기록이 실패했는지 구분한다(해시되어 원문은 남지 않는다).
          context: `${input.entityType}:${input.action}`,
        })
      }
    },
  }
}
