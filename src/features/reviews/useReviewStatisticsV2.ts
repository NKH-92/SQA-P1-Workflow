import { useCallback } from 'react'
import { fetchReviewStatisticsV2 } from '../../data'
import { hasSupabaseConfig } from '../../lib/supabase'
import type { AppData, ReviewStatisticsV2Envelope, ReviewStatisticsV2Params } from '../../types'
import { buildReviewStatisticsV2 } from './reviewStatisticsV2'

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
  return useCallback(
    async (params: ReviewStatisticsV2Params): Promise<ReviewStatisticsV2Envelope> => {
      if (hasSupabaseConfig) return fetchReviewStatisticsV2(params)
      return buildReviewStatisticsV2(
        { reviewRequests: data.reviewRequests, reviewEvents: data.reviewEvents ?? [], profiles: data.profiles ?? [] },
        params,
      )
    },
    [data],
  )
}
