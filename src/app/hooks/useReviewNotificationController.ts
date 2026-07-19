import { useCallback } from 'react'
import { createRepositoryContext, markAllRelevantReviewsSeen } from '../../data'
import type { AppDataUpdater } from '../../data/repositories/appDataUpdater'
import type { AppData, Profile } from '../../types'
import type { MutationRunner } from './useMutationRunner'

export function useReviewNotificationController(
  profile: Profile | null,
  data: AppData,
  setData: AppDataUpdater,
  mutate: MutationRunner,
) {
  return useCallback(() => {
    if (!profile) return
    void mutate(async () => {
      await markAllRelevantReviewsSeen(createRepositoryContext(profile, data, setData))
    }, '검토 알림을 모두 읽음 처리했습니다.')
  }, [data, mutate, profile, setData])
}
