import type { Dispatch, SetStateAction } from 'react'
import type { ActivityEntityType, ActivityLog, AppData, Profile } from '../types'
import { makeId } from './format'
import { supabase } from './supabase'

export async function recordActivityLog(
  setData: Dispatch<SetStateAction<AppData>>,
  input: {
    actor: Profile
    targetUserId?: string | null
    entityType: ActivityEntityType
    entityId?: string | null
    action: string
    summary: string
    metadata?: Record<string, unknown>
  },
  options: { isRemote?: boolean } = {},
) {
  const row = {
    actor_id: input.actor.id,
    target_user_id: input.targetUserId ?? null,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    action: input.action,
    summary: input.summary,
    metadata: input.metadata ?? {},
  }

  if (options.isRemote && supabase) {
    const { error } = await supabase.from('activity_logs').insert(row)
    if (error) {
      console.warn('활동 로그 저장 실패', error)
    }
    return
  }

  const item: ActivityLog = {
    id: makeId('activity'),
    ...row,
    created_at: new Date().toISOString(),
  }
  setData((current) => ({
    ...current,
    activityLogs: [item, ...current.activityLogs].slice(0, 40),
  }))
}
