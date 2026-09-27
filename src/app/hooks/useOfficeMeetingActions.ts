import { useCallback } from 'react'
import { acknowledgeOfficeMeeting, createRepositoryContext, endOfficeMeeting } from '../../data'
import type { AppDataUpdater } from '../../data/repositories/appDataUpdater'
import { meetingToast } from '../../features/office/officeMeetingModel'
import type { AppData, Profile } from '../../types'
import type { MutationRunner } from './useMutationRunner'

/** 어느 화면에서든 회의 안내 띠에서 바로 확인·완료할 수 있게 한다. */
export function useOfficeMeetingActions(
  profile: Profile | null,
  data: AppData,
  setData: AppDataUpdater,
  mutate: MutationRunner,
) {
  const acknowledge = useCallback((meetingId: string) => {
    if (!profile) return Promise.resolve(false)
    const toast = meetingToast('acknowledged', data.officeMeeting)
    return mutate(async () => {
      await acknowledgeOfficeMeeting(createRepositoryContext(profile, data, setData), meetingId)
    }, toast)
  }, [data, mutate, profile, setData])

  const end = useCallback((meetingId: string) => {
    if (!profile) return Promise.resolve(false)
    const toast = meetingToast('ended', data.officeMeeting)
    return mutate(async () => {
      await endOfficeMeeting(createRepositoryContext(profile, data, setData), meetingId)
    }, toast)
  }, [data, mutate, profile, setData])

  return { acknowledge, end }
}
