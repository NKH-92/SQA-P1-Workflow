import {
  hasOfficeMeetingStarted,
  isOfficeMeetingOpen,
  isOfficeRoomMeeting,
  meetingParticipant,
  officeMeetingPlace,
} from '../../data/validation/officeMeeting'
import { businessDateKey, businessDateParts } from '../../lib/businessTime'
import { formatClock } from '../../lib/format'
import { withJosa } from '../../lib/korean'
import type { OfficeMeeting } from '../../types'
import type { SceneOccupant } from './officeLayoutModel'

export type MeetingTimeSlot = {
  /** ‘14:30’(서울 시각) */
  value: string
  /** ‘오후 2:30’ */
  label: string
  startsAt: string
}

/** 오늘(서울) 안에서 고를 수 있는 시작 시각. 지금 다음 10분 단위부터 23:50까지 */
export function meetingTimeSlots(now = Date.now(), stepMinutes = 10): MeetingTimeSlot[] {
  const instant = new Date(now)
  const parts = businessDateParts(instant)
  const today = businessDateKey(instant)
  const first = Math.floor((parts.hour * 60 + parts.minute) / stepMinutes) * stepMinutes + stepMinutes
  const slots: MeetingTimeSlot[] = []
  for (let minutes = first; minutes < 24 * 60; minutes += stepMinutes) {
    const value = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    const startsAt = new Date(`${today}T${value}:00+09:00`).toISOString()
    slots.push({ value, label: formatClock(startsAt) ?? value, startsAt })
  }
  return slots
}

/** ‘오후 2:30 시작 예정’, ‘오후 2:30 시작’처럼 회의가 언제인지 */
export function meetingWhenText(meeting: Pick<OfficeMeeting, 'starts_at' | 'created_at'>, now = Date.now()) {
  const clock = formatClock(meeting.starts_at) ?? ''
  return hasOfficeMeetingStarted(meeting, now) ? `${clock} 시작` : `${clock} 시작 예정`
}

/** 안내 띠·창에 쓰는 회의 한 줄: ‘오후 2:30 · 3층 대회의실 · 일탈 논의’ */
export function meetingSummaryParts(meeting: OfficeMeeting, now = Date.now()): string[] {
  const parts: string[] = []
  if (!hasOfficeMeetingStarted(meeting, now)) parts.push(formatClock(meeting.starts_at) ?? '')
  parts.push(officeMeetingPlace(meeting))
  if (meeting.title) parts.push(meeting.title)
  return parts.filter(Boolean)
}

/** 확인·끝내기 뒤 알림 문구 */
export function meetingToast(kind: 'acknowledged' | 'ended', meeting: OfficeMeeting | null | undefined, now = Date.now()) {
  if (!meeting) return kind === 'acknowledged' ? '회의 요청을 확인했어요.' : '회의를 마쳤어요.'
  const started = hasOfficeMeetingStarted(meeting, now)
  if (kind === 'ended') {
    if (!started) return '회의를 취소했어요.'
    return isOfficeRoomMeeting(meeting) ? '회의를 마쳤어요. 회의실이 비었어요.' : '회의를 마쳤어요.'
  }
  const place = officeMeetingPlace(meeting)
  return started
    ? `회의 요청을 확인했어요. ${withJosa(place, '으로/로')} 가 주세요.`
    : `회의 요청을 확인했어요. ${formatClock(meeting.starts_at) ?? ''}에 ${place}에서 만나요.`
}

export type OfficeMeetingSceneState = {
  /** 회의가 시작돼 사무실 회의실로 간(확인한) 사람의 자리 번호 */
  attendeeSeats: number[]
  /** 다른 곳에서 하는 회의에 간(확인한) 사람의 자리 번호. 자리에 ‘회의 중’ 표지가 선다. */
  awaySeats: number[]
  /** 부름을 받았지만 아직 확인하지 않은 사람의 자리 번호(머리 위에 느낌표) */
  invitedSeats: number[]
}

const EMPTY: OfficeMeetingSceneState = { attendeeSeats: [], awaySeats: [], invitedSeats: [] }

/**
 * 열린 회의를 사무실 자리 기준으로 나눈다. 자리에 없는 사람은 캐릭터가 없어 빠진다.
 * 예약한 회의는 시작 시각이 되기 전까지 아무도 자리를 뜨지 않는다(확인 전 느낌표만 뜬다).
 */
export function meetingSceneState(
  meeting: OfficeMeeting | null | undefined,
  occupants: readonly Pick<SceneOccupant, 'seatIndex' | 'profileId'>[],
  now = Date.now(),
): OfficeMeetingSceneState {
  if (!isOfficeMeetingOpen(meeting, now)) return EMPTY
  const started = hasOfficeMeetingStarted(meeting, now)
  const inRoom = isOfficeRoomMeeting(meeting)
  const attendeeSeats: number[] = []
  const awaySeats: number[] = []
  const invitedSeats: number[] = []
  for (const occupant of occupants) {
    const participant = meetingParticipant(meeting, occupant.profileId)
    if (!participant) continue
    if (!participant.acknowledged_at) invitedSeats.push(occupant.seatIndex)
    else if (started) (inRoom ? attendeeSeats : awaySeats).push(occupant.seatIndex)
  }
  const byNumber = (left: number, right: number) => left - right
  return { attendeeSeats: attendeeSeats.sort(byNumber), awaySeats: awaySeats.sort(byNumber), invitedSeats: invitedSeats.sort(byNumber) }
}

/** 확인한 사람 수와 전체 대상자 수(연 사람 포함) */
export function meetingProgress(meeting: OfficeMeeting): { confirmed: number; total: number } {
  return {
    confirmed: meeting.participants.filter((participant) => participant.acknowledged_at).length,
    total: meeting.participants.length,
  }
}

/** 내가 부름을 받고 아직 확인하지 않았는지 */
export function awaitsMyConfirmation(meeting: OfficeMeeting | null | undefined, profileId: string, now = Date.now()) {
  if (!isOfficeMeetingOpen(meeting, now)) return false
  const participant = meetingParticipant(meeting, profileId)
  return Boolean(participant && !participant.acknowledged_at)
}

/**
 * 회의실 모습이 다음에 바뀌는 때(예약한 회의의 시작 시각, 아니면 저절로 끝나는 시각).
 * 화면은 이때 한 번 다시 그려 캐릭터를 회의실로 보내거나 돌려보낸다. 열린 회의가 없으면 null
 */
export function nextMeetingChangeAt(meeting: OfficeMeeting | null | undefined, now = Date.now()): number | null {
  if (!isOfficeMeetingOpen(meeting, now)) return null
  const start = Date.parse(meeting.starts_at)
  return start > now ? start : Date.parse(meeting.expires_at)
}
