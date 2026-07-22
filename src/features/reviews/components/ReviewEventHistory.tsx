import { useCallback, useEffect, useState } from 'react'
import { fetchReviewEventsPage } from '../../../data'
import { hasSupabaseConfig } from '../../../lib/supabase'
import { formatDate } from '../../../lib/format'
import type { ReviewEvent } from '../../../types'
import { compareDecimalIds } from '../../../lib/decimalId'

type ReviewEventHistoryProps = {
  reviewRequestId: string
  /** Preview/local mode already has events in AppData; pass them when remote bootstrap is unused. */
  localEvents?: ReviewEvent[]
}

export function ReviewEventHistory({ reviewRequestId, localEvents = [] }: ReviewEventHistoryProps) {
  const [events, setEvents] = useState<ReviewEvent[]>([])
  const [beforeId, setBeforeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPage = useCallback(async (cursor: string | null, replace: boolean) => {
    if (!hasSupabaseConfig) {
      const sorted = [...localEvents]
        .filter((event) => event.review_request_id === reviewRequestId)
        .sort((left, right) => compareDecimalIds(right.id, left.id))
      setEvents(sorted)
      setExhausted(true)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const page = await fetchReviewEventsPage(reviewRequestId, cursor, 50)
      setEvents((current) => (replace ? page : [...current, ...page]))
      if (page.length === 0) {
        setExhausted(true)
        return
      }
      const lastId = page[page.length - 1]?.id
      setBeforeId(lastId == null ? null : String(lastId))
      if (page.length < 50) setExhausted(true)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '이벤트 이력을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [localEvents, reviewRequestId])

  useEffect(() => {
    setEvents([])
    setBeforeId(null)
    setExhausted(false)
    void loadPage(null, true)
  }, [loadPage])

  if (error) {
    return <p className="review-event-history-error" role="alert">{error}</p>
  }

  return (
    <section className="review-event-history" aria-label="검토 이벤트 이력">
      <h4>이벤트 이력</h4>
      {events.length === 0 && !loading ? (
        <p className="muted">표시할 이벤트가 없습니다.</p>
      ) : (
        <ol className="review-event-history-list">
          {events.map((event) => (
            <li key={String(event.id)}>
              <strong>{event.event_type}</strong>
              <span>{formatDate(event.occurred_at)}</span>
              {event.actor_name_snapshot ? <span>{event.actor_name_snapshot}</span> : null}
            </li>
          ))}
        </ol>
      )}
      {!exhausted && (
        <button
          type="button"
          className="ghost-btn"
          disabled={loading || (beforeId == null && events.length > 0)}
          onClick={() => void loadPage(beforeId, false)}
        >
          {loading ? '불러오는 중...' : '이전 이벤트 더 보기'}
        </button>
      )}
    </section>
  )
}
