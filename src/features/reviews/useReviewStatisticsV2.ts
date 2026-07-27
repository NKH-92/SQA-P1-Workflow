import { useCallback } from 'react'
import { fetchReviewStatisticsV2 } from '../../data'
import { hasSupabaseConfig } from '../../lib/supabase'
import type { AppData, ReviewStatisticsV2Envelope, ReviewStatisticsV2Params } from '../../types'
import { buildReviewStatisticsV2 } from './reviewStatisticsV2'

const EMPTY_REVIEW_EVENTS: NonNullable<AppData['reviewEvents']> = []
const EMPTY_PROFILES: AppData['profiles'] = []

export function reviewStatisticsV2ContentRevision(
  data: Pick<AppData, 'reviewRequests' | 'reviewEvents'>,
) {
  const requests = data.reviewRequests
    .map((request) =>
      JSON.stringify([
        request.id,
        request.requester_id,
        request.status,
        request.review_round ?? null,
        request.created_at ?? null,
        request.updated_at ?? null,
      ]),
    )
    .sort()
  const events = (data.reviewEvents ?? [])
    .map((event) =>
      JSON.stringify([
        event.id,
        event.review_request_id,
        event.event_type,
        event.from_status,
        event.to_status,
        event.occurred_at,
      ]),
    )
    .sort()

  return JSON.stringify([requests, events])
}

/**
 * Leader-only server-aggregated review statistics, unified across
 * runtime modes. Against a real Supabase project this calls
 * `get_review_statistics_v2` (never downloads raw event rows). In local
 * preview (no Supabase project configured) it falls back to
 * `buildReviewStatisticsV2`, the pure-TS parity builder that reconstructs the
 * identical envelope from the in-memory AppData using the same Asia/Seoul
 * business-day boundary — so the panel renders the same shape either way.
 */
export function useReviewStatisticsV2(
  data: Pick<AppData, 'reviewRequests' | 'reviewEvents'> & { profiles?: AppData['profiles'] },
) {
  const reviewRequests = data.reviewRequests
  const reviewEvents = data.reviewEvents ?? EMPTY_REVIEW_EVENTS
  const profiles = data.profiles ?? EMPTY_PROFILES
  const fetchRemoteStatistics = useCallback(
    (params: ReviewStatisticsV2Params): Promise<ReviewStatisticsV2Envelope> => fetchReviewStatisticsV2(params),
    [],
  )
  const buildPreviewStatistics = useCallback(
    async (params: ReviewStatisticsV2Params): Promise<ReviewStatisticsV2Envelope> => {
      return buildReviewStatisticsV2(
        { reviewRequests, reviewEvents, profiles },
        params,
      )
    },
    [profiles, reviewEvents, reviewRequests],
  )

  return hasSupabaseConfig ? fetchRemoteStatistics : buildPreviewStatistics
}
