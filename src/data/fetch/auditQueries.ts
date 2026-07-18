import { supabase } from '../../lib/supabase'
import type { AuditEvent } from '../../types'

export async function fetchAuditEvents(beforeId: number | null = null, limit = 50): Promise<AuditEvent[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('list_audit_events', {
    p_limit: Math.max(1, Math.min(limit, 100)),
    p_before_id: beforeId,
  })
  if (error) throw error
  return (data ?? []).map((event: Record<string, unknown>) => ({ ...event, id: Number(event.id) })) as AuditEvent[]
}
