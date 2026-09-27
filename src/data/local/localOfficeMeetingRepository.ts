import { PERMISSION_MESSAGE, UserFacingError } from '../../lib/errors'
import type { OfficeMeeting } from '../../types'
import type { OfficeMeetingRepository, RepositoryDeps } from '../repositories/types'
import {
  canEndOfficeMeeting,
  canOpenOfficeMeeting,
  isOfficeMeetingOpen,
  OFFICE_MEETING_BUSY_MESSAGE,
  OFFICE_MEETING_DURATION_MS,
  OFFICE_MEETING_FORBIDDEN_MESSAGE,
  OFFICE_MEETING_GONE_MESSAGE,
  OFFICE_MEETING_PARTICIPANT_MESSAGE,
  validateOfficeMeetingStart,
} from '../validation/officeMeeting'

let localMeetingSequence = 0

/** 미리보기 사무실 회의. 원격 RPC와 같은 권한·한 번에 하나·자리 규칙을 따른다. */
export function createLocalOfficeMeetingRepository(ctx: RepositoryDeps): OfficeMeetingRepository {
  return {
    async startMeeting(input) {
      const { profile, data, setData } = ctx
      if (!canOpenOfficeMeeting(profile)) throw new UserFacingError(PERMISSION_MESSAGE)
      const now = Date.now()
      const request = validateOfficeMeetingStart(input, profile, data.officeLayout, data.memberPresence, now)
      const people = request.invitees.map((id) => data.profiles.find((candidate) => candidate.id === id))
      if (people.some((person) => !person || person.is_active === false || person.role === 'team_leader')) {
        throw new UserFacingError(OFFICE_MEETING_PARTICIPANT_MESSAGE)
      }
      if (isOfficeMeetingOpen(data.officeMeeting, now)) throw new UserFacingError(OFFICE_MEETING_BUSY_MESSAGE)
      const createdAt = new Date(now).toISOString()
      const startsAt = request.startsAt ?? createdAt
      localMeetingSequence += 1
      const meeting: OfficeMeeting = {
        id: `preview-meeting-${now}-${localMeetingSequence}`,
        title: request.title,
        organizer_id: profile.id,
        organizer_name: profile.name,
        created_at: createdAt,
        starts_at: startsAt,
        location: request.location,
        expires_at: new Date(Date.parse(startsAt) + OFFICE_MEETING_DURATION_MS).toISOString(),
        participants: [
          { user_id: profile.id, name: profile.name, acknowledged_at: createdAt },
          ...people.map((person) => ({ user_id: person!.id, name: person!.name, acknowledged_at: null })),
        ],
      }
      setData((current) => ({ ...current, officeMeeting: meeting }))
    },

    async acknowledgeMeeting(meetingId) {
      const { profile, data, setData } = ctx
      if (!canOpenOfficeMeeting(profile)) throw new UserFacingError(PERMISSION_MESSAGE)
      const meeting = data.officeMeeting
      if (!isOfficeMeetingOpen(meeting) || meeting.id !== meetingId || !meeting.participants.some((item) => item.user_id === profile.id)) {
        throw new UserFacingError(OFFICE_MEETING_GONE_MESSAGE)
      }
      const acknowledgedAt = new Date().toISOString()
      setData((current) => {
        if (current.officeMeeting?.id !== meetingId) return current
        return {
          ...current,
          officeMeeting: {
            ...current.officeMeeting,
            participants: current.officeMeeting.participants.map((participant) =>
              participant.user_id === profile.id && !participant.acknowledged_at
                ? { ...participant, acknowledged_at: acknowledgedAt }
                : participant),
          },
        }
      })
    },

    async endMeeting(meetingId) {
      const { profile, data, setData } = ctx
      const meeting = data.officeMeeting
      if (!meeting || meeting.id !== meetingId) return { ended: false }
      if (!canEndOfficeMeeting(profile, meeting)) {
        throw new UserFacingError(canOpenOfficeMeeting(profile) ? OFFICE_MEETING_FORBIDDEN_MESSAGE : PERMISSION_MESSAGE)
      }
      setData((current) => (current.officeMeeting?.id === meetingId ? { ...current, officeMeeting: null } : current))
      return { ended: true }
    },
  }
}
