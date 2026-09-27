import { businessDateKey } from '../../lib/businessTime'
import { PERMISSION_MESSAGE, UserFacingError } from '../../lib/errors'
import type { MemberPresence, OfficeLayout, OfficeMeeting, OfficeMeetingParticipant, Profile } from '../../types'
import { leaveOn } from './memberPresence'

export const OFFICE_MEETING_TITLE_MAX = 60
export const OFFICE_MEETING_LOCATION_MAX = 30
export const OFFICE_MEETING_MAX_INVITEES = 8
/** 아무도 끝내지 않은 회의가 저절로 끝나는 시간(시작 시각부터, start_office_meeting과 같다) */
export const OFFICE_MEETING_DURATION_MS = 3 * 60 * 60 * 1000
/** 시작 시각이 지금보다 이만큼 앞서도 ‘지금 바로’로 친다(기기 시계 차이). */
export const OFFICE_MEETING_CLOCK_SKEW_MS = 5 * 60 * 1000
/** 장소를 비워 두면 여기서 한다(도트 사무실의 작은 회의실). */
export const OFFICE_MEETING_ROOM_NAME = '사무실 회의실'

export const OFFICE_MEETING_BUSY_MESSAGE = '회의실이 사용 중이에요. 지금 회의가 끝나면 열 수 있어요.'
export const OFFICE_MEETING_INVALID_MESSAGE = `회의 주제는 ${OFFICE_MEETING_TITLE_MAX}자, 장소는 ${OFFICE_MEETING_LOCATION_MAX}자까지 쓰고, 부를 사람은 1~${OFFICE_MEETING_MAX_INVITEES}명까지 고를 수 있어요.`
export const OFFICE_MEETING_PARTICIPANT_MESSAGE = '사무실에 앉은 사람만 회의에 부를 수 있어요. 자리 배치를 확인해 주세요.'
export const OFFICE_MEETING_AWAY_MESSAGE = '휴가·출장 중인 사람은 회의에 부를 수 없어요.'
export const OFFICE_MEETING_TIME_MESSAGE = '회의는 지금 바로 열거나 오늘 안의 시각으로 정해 주세요.'
export const OFFICE_MEETING_GONE_MESSAGE = '이미 끝난 회의예요.'
export const OFFICE_MEETING_FORBIDDEN_MESSAGE = '회의를 연 사람이나 파트장만 회의를 끝낼 수 있어요.'

export type OfficeMeetingStartInput = {
  title: string
  /** 부를 사람. 나는 빼고 센다(연 사람은 저절로 들어간다). */
  participantIds: string[]
  /** 시작 시각(ISO). null이면 지금 바로 */
  startsAt: string | null
  /** 장소. 비우면 사무실 회의실 */
  location: string
}

export type OfficeMeetingStartRequest = {
  title: string
  invitees: string[]
  startsAt: string | null
  location: string
}

/** 회의를 열 수 있는 사람: 앱을 쓸 수 있는 파트장·파트원. 팀장은 읽기 전용이다. */
export function canOpenOfficeMeeting(profile: Profile) {
  return profile.is_active !== false
    && profile.must_change_password !== true
    && (profile.role === 'leader' || profile.role === 'member')
}

/** 회의를 끝낼(시작 전이면 취소할) 수 있는 사람: 연 사람이나 활성 파트장 */
export function canEndOfficeMeeting(profile: Profile, meeting: Pick<OfficeMeeting, 'organizer_id'>) {
  if (!canOpenOfficeMeeting(profile)) return false
  return meeting.organizer_id === profile.id || profile.role === 'leader'
}

export function isOfficeMeetingOpen(meeting: OfficeMeeting | null | undefined, now = Date.now()): meeting is OfficeMeeting {
  return Boolean(meeting) && Date.parse(meeting!.expires_at) > now
}

/**
 * 시작 시각이 지났는지(예약한 회의는 그때까지 ‘예정’). 지금 바로 연 회의는 연 때가 곧 시작이라,
 * 화면 시각이 조금 늦어도 늘 ‘회의 중’이다.
 */
export function hasOfficeMeetingStarted(meeting: Pick<OfficeMeeting, 'starts_at' | 'created_at'>, now = Date.now()) {
  const start = Date.parse(meeting.starts_at)
  return start <= Date.parse(meeting.created_at) || start <= now
}

/** 사무실 회의실에서 하는 회의인지(장소를 비워 둔 회의) */
export function isOfficeRoomMeeting(meeting: Pick<OfficeMeeting, 'location'>) {
  return meeting.location.trim() === ''
}

export function officeMeetingPlace(meeting: Pick<OfficeMeeting, 'location'>) {
  return isOfficeRoomMeeting(meeting) ? OFFICE_MEETING_ROOM_NAME : meeting.location.trim()
}

export function meetingParticipant(meeting: OfficeMeeting | null | undefined, userId: string): OfficeMeetingParticipant | undefined {
  return meeting?.participants.find((participant) => participant.user_id === userId)
}

/**
 * 시작 입력을 확인하고 서버에 보낼 값(나를 뺀 중복 없는 대상자 등)을 돌려준다.
 * 대상자는 지금 사무실에 앉은 사람이고 그날 휴가·출장 중이 아니어야 한다(팀장·비활성 계정은 서버가 한 번 더 막는다).
 */
export function validateOfficeMeetingStart(
  input: OfficeMeetingStartInput,
  profile: Profile,
  layout: OfficeLayout | undefined,
  presence: MemberPresence | undefined,
  now: number = Date.now(),
): OfficeMeetingStartRequest {
  const title = input.title.trim()
  const location = input.location.trim()
  const invitees = [...new Set(input.participantIds)].filter((id) => id !== profile.id)
  if (
    title.length > OFFICE_MEETING_TITLE_MAX
    || location.length > OFFICE_MEETING_LOCATION_MAX
    || invitees.length < 1
    || invitees.length > OFFICE_MEETING_MAX_INVITEES
  ) {
    throw new UserFacingError(OFFICE_MEETING_INVALID_MESSAGE)
  }
  let startsAt: string | null = null
  if (input.startsAt) {
    const start = Date.parse(input.startsAt)
    if (
      Number.isNaN(start)
      || start < now - OFFICE_MEETING_CLOCK_SKEW_MS
      || businessDateKey(new Date(start)) !== businessDateKey(new Date(now))
    ) {
      throw new UserFacingError(OFFICE_MEETING_TIME_MESSAGE)
    }
    startsAt = start <= now ? null : new Date(start).toISOString()
  }
  const seated = new Set((layout?.seats ?? []).map((seat) => seat.profile_id))
  if (invitees.some((id) => !seated.has(id))) throw new UserFacingError(OFFICE_MEETING_PARTICIPANT_MESSAGE)
  const meetingDay = businessDateKey(new Date(startsAt ? Date.parse(startsAt) : now))
  if (invitees.some((id) => leaveOn(presence, id, meetingDay))) throw new UserFacingError(OFFICE_MEETING_AWAY_MESSAGE)
  return { title, invitees, startsAt, location }
}

function parseParticipant(value: unknown): OfficeMeetingParticipant | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.user_id !== 'string' || typeof row.name !== 'string') return null
  if (row.acknowledged_at !== null && typeof row.acknowledged_at !== 'string') return null
  return { user_id: row.user_id, name: row.name, acknowledged_at: row.acknowledged_at }
}

/** get_office_meeting 응답을 확인한다. 회의가 없으면 { meeting: null }, 모양이 다르면 null(불러오기 실패와 같게 다룬다). */
export function parseOfficeMeeting(value: unknown): { meeting: OfficeMeeting | null } | null {
  if (value === null) return { meeting: null }
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const text = ['id', 'title', 'organizer_id', 'organizer_name', 'created_at', 'starts_at', 'location', 'expires_at'] as const
  if (text.some((key) => typeof row[key] !== 'string') || !Array.isArray(row.participants)) return null
  const participants = row.participants.map(parseParticipant)
  if (!participants.every((participant): participant is OfficeMeetingParticipant => participant !== null)) return null
  return {
    meeting: {
      id: row.id as string,
      title: row.title as string,
      organizer_id: row.organizer_id as string,
      organizer_name: row.organizer_name as string,
      created_at: row.created_at as string,
      starts_at: row.starts_at as string,
      location: row.location as string,
      expires_at: row.expires_at as string,
      participants,
    },
  }
}

/** 회의 RPC의 detail 코드를 사용자 문구로 바꾼다. 모르는 오류는 그대로 둔다. */
export function translateOfficeMeetingError<T extends { message?: string; details?: string }>(error: T): T | UserFacingError {
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  if (text.includes('SQA_OFFICE_MEETING_BUSY')) return new UserFacingError(OFFICE_MEETING_BUSY_MESSAGE)
  if (text.includes('SQA_OFFICE_MEETING_PARTICIPANT_AWAY')) return new UserFacingError(OFFICE_MEETING_AWAY_MESSAGE)
  if (text.includes('SQA_OFFICE_MEETING_PARTICIPANT_INVALID')) return new UserFacingError(OFFICE_MEETING_PARTICIPANT_MESSAGE)
  if (text.includes('SQA_OFFICE_MEETING_TIME_INVALID')) return new UserFacingError(OFFICE_MEETING_TIME_MESSAGE)
  if (text.includes('SQA_OFFICE_MEETING_INVALID')) return new UserFacingError(OFFICE_MEETING_INVALID_MESSAGE)
  if (text.includes('SQA_OFFICE_MEETING_NOT_FOUND')) return new UserFacingError(OFFICE_MEETING_GONE_MESSAGE)
  if (text.includes('SQA_OFFICE_MEETING_FORBIDDEN')) return new UserFacingError(OFFICE_MEETING_FORBIDDEN_MESSAGE)
  if (text.includes('SQA_TEAM_LEADER_READ_ONLY') || text.includes('SQA_APP_ACCESS_REQUIRED')) return new UserFacingError(PERMISSION_MESSAGE)
  return error
}
