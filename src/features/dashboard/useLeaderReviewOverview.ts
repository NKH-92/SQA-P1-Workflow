import { useEffect, useMemo, useState } from 'react'
import { businessDateKey } from '../../lib/businessTime'
import { toUserMessage } from '../../lib/errors'
import type { AppData, ReviewStatisticsV2Envelope } from '../../types'
import {
  reviewStatisticsV2ContentRevision,
  useReviewStatisticsV2,
} from '../reviews/useReviewStatisticsV2'
import { leaderReviewRange } from './dashboardModels'

export type LeaderReviewOverviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; envelope: ReviewStatisticsV2Envelope }

export function useLeaderReviewOverview(data: AppData): LeaderReviewOverviewState {
  const fetchStatistics = useReviewStatisticsV2(data)
  const reviewRequests = data.reviewRequests
  const reviewEvents = data.reviewEvents
  const contentRevision = useMemo(
    () => reviewStatisticsV2ContentRevision({ reviewRequests, reviewEvents }),
    [reviewEvents, reviewRequests],
  )
  const [referenceDate] = useState(() => new Date())
  const range = useMemo(() => leaderReviewRange(businessDateKey(referenceDate)), [referenceDate])
  const [state, setState] = useState<LeaderReviewOverviewState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fetchStatistics(range).then(
      (envelope) => {
        if (!cancelled) setState({ status: 'ready', envelope })
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: toUserMessage(error) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [contentRevision, fetchStatistics, range])

  return state
}
