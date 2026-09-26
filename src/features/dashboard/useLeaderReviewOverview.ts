import { useCallback, useEffect, useMemo, useState } from 'react'
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
  /** retry: 집계를 다시 불러온다(오류 화면의 ‘다시 시도’). */
  | { status: 'error'; message: string; retry: () => void }
  /** refreshing: 새 검토가 들어와 다시 집계하는 동안에도 이전 숫자를 그대로 보여 준다. */
  | { status: 'ready'; envelope: ReviewStatisticsV2Envelope; refreshing?: true }

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
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false
    // 이미 보여 준 숫자가 있으면 ‘불러오는 중’으로 되돌리지 않는다 — 읽는 도중 영역이 접혔다 펼쳐지지 않게.
    setState((current) => (current.status === 'ready'
      ? { status: 'ready', envelope: current.envelope, refreshing: true }
      : { status: 'loading' }))
    fetchStatistics(range).then(
      (envelope) => {
        if (!cancelled) setState({ status: 'ready', envelope })
      },
      (error: unknown) => {
        if (cancelled) return
        setState((current) => (current.status === 'ready'
          ? { status: 'ready', envelope: current.envelope }
          : { status: 'error', message: toUserMessage(error), retry }))
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt, contentRevision, fetchStatistics, range, retry])

  return state
}
