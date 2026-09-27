import { useMemo } from 'react'
import {
  acknowledgeOfficeMeeting,
  addMemberLeave,
  createRepositoryContext,
  deleteMemberLeave,
  endOfficeMeeting,
  replaceOfficeSeats,
  setMemberStatus,
  startOfficeMeeting,
  type MemberLeaveInput,
  type OfficeMeetingStartInput,
  type OfficeSeatInput,
} from '../../data'
import type { AppDataUpdater } from '../../data/repositories/appDataUpdater'
import type { AppData, MemberStatusKind, Profile } from '../../types'

export function useOfficeController(profile: Profile, data: AppData, setData: AppDataUpdater) {
  const context = useMemo(() => createRepositoryContext(profile, data, setData), [data, profile, setData])
  return {
    replaceSeats: (seats: OfficeSeatInput[], expectedRevision: string | null) =>
      replaceOfficeSeats(context, { seats, expectedRevision }),
    startMeeting: (input: OfficeMeetingStartInput) => startOfficeMeeting(context, input),
    acknowledgeMeeting: (meetingId: string) => acknowledgeOfficeMeeting(context, meetingId),
    endMeeting: (meetingId: string) => endOfficeMeeting(context, meetingId),
    setStatus: (profileId: string, status: MemberStatusKind | null) => setMemberStatus(context, profileId, status),
    addLeave: (input: MemberLeaveInput) => addMemberLeave(context, input),
    deleteLeave: (leaveId: string) => deleteMemberLeave(context, leaveId),
  }
}
