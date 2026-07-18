import { supabase } from '../../lib/supabase'
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
      if (error) console.warn('활동 로그 저장 실패', error)
    },
  }
}
