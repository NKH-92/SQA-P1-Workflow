import { useState } from 'react'
import { fetchAuditEvents } from '../../data'
import { toUserMessage } from '../../lib/errors'
import type { AuditEvent } from '../../types'

export function useAuditFeed(initialEvents: AuditEvent[]) {
  const [events, setEvents] = useState(initialEvents)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (append: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const beforeId = append && events.length > 0 ? events[events.length - 1].id : null
      const next = await fetchAuditEvents(beforeId)
      setEvents((current) => (append ? [...current, ...next] : next))
    } catch (loadError) {
      setError(toUserMessage(loadError))
    } finally {
      setLoading(false)
    }
  }

  return { events, loading, error, load }
}
