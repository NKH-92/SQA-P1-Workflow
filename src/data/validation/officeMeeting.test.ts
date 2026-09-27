import { describe, expect, it } from 'vitest'
import { previewLeader, previewMember } from '../../demoData'
import { UserFacingError } from '../../lib/errors'
import type { MemberPresence, OfficeMeeting } from '../../types'
import {
  canEndOfficeMeeting,
  canOpenOfficeMeeting,
  hasOfficeMeetingStarted,
  isOfficeMeetingOpen,
  isOfficeRoomMeeting,
  OFFICE_MEETING_AWAY_MESSAGE,
  OFFICE_MEETING_BUSY_MESSAGE,
  OFFICE_MEETING_INVALID_MESSAGE,
  OFFICE_MEETING_PARTICIPANT_MESSAGE,
  OFFICE_MEETING_TEAM_LEADER_MESSAGE,
  OFFICE_MEETING_TIME_MESSAGE,
  officeMeetingPlace,
  parseOfficeMeeting,
  translateOfficeMeetingError,
  validateOfficeMeetingStart,
  type OfficeMeetingStartInput,
} from './officeMeeting'

const meeting: OfficeMeeting = {
  id: 'meeting-1',
  title: '5분 회의',
  organizer_id: previewMember.id,
  organizer_name: previewMember.name,
  created_at: '2026-09-27T01:00:00.000Z',
  starts_at: '2026-09-27T01:00:00.000Z',
  location: '',
  expires_at: '2026-09-27T04:00:00.000Z',
  participants: [
    { user_id: previewMember.id, name: previewMember.name, acknowledged_at: '2026-09-27T01:00:00.000Z' },
    { user_id: 'member-02', name: '파트원 B', acknowledged_at: null },
  ],
}

const layout = {
  revision: 'r1',
  seats: [
    { seat_index: 2, profile_id: previewMember.id, name: previewMember.name, gender: 'female' as const, style_seed: 1 },
    { seat_index: 6, profile_id: 'member-02', name: '파트원 B', gender: 'male' as const, style_seed: 2 },
    { seat_index: 7, profile_id: 'member-03', name: '파트원 C', gender: 'female' as const, style_seed: 3 },
    { seat_index: 8, profile_id: 'team-1', name: '팀장', role: 'team_leader' as const, gender: 'male' as const, style_seed: 4 },
  ],
}

/** 2026-09-27 10:00 서울 */
const NOW = Date.parse('2026-09-27T01:00:00.000Z')

const presence: MemberPresence = {
  statuses: [{ profile_id: 'member-02', name: '파트원 B', status: 'lab', updated_at: '2026-09-27T00:30:00.000Z' }],
  leaves: [{ id: 'leave-1', profile_id: 'member-03', name: '파트원 C', kind: 'vacation', starts_on: '2026-09-27', ends_on: '2026-09-29', note: '' }],
}

function input(overrides: Partial<OfficeMeetingStartInput>): OfficeMeetingStartInput {
  return { title: '', participantIds: ['member-02'], startsAt: null, location: '', ...overrides }
}

describe('office meeting rules', () => {
  it('lets active leaders and members open a meeting but keeps team leaders read-only', () => {
    expect(canOpenOfficeMeeting(previewMember)).toBe(true)
    expect(canOpenOfficeMeeting(previewLeader)).toBe(true)
    expect(canOpenOfficeMeeting({ ...previewLeader, role: 'team_leader' })).toBe(false)
    expect(canOpenOfficeMeeting({ ...previewMember, is_active: false })).toBe(false)
    expect(canOpenOfficeMeeting({ ...previewMember, must_change_password: true })).toBe(false)
  })

  it('lets only the organizer or the leader end the meeting', () => {
    expect(canEndOfficeMeeting(previewMember, meeting)).toBe(true)
    expect(canEndOfficeMeeting(previewLeader, meeting)).toBe(true)
    expect(canEndOfficeMeeting({ ...previewMember, id: 'member-02' }, meeting)).toBe(false)
    expect(canEndOfficeMeeting({ ...previewLeader, role: 'team_leader' }, meeting)).toBe(false)
  })

  it('treats an expired meeting as closed and a later start as scheduled', () => {
    expect(isOfficeMeetingOpen(meeting, Date.parse('2026-09-27T03:59:00.000Z'))).toBe(true)
    expect(isOfficeMeetingOpen(meeting, Date.parse('2026-09-27T04:00:00.000Z'))).toBe(false)
    expect(isOfficeMeetingOpen(null)).toBe(false)
    const later = { ...meeting, starts_at: '2026-09-27T05:30:00.000Z' }
    expect(hasOfficeMeetingStarted(later, NOW)).toBe(false)
    expect(hasOfficeMeetingStarted(later, Date.parse('2026-09-27T05:30:00.000Z'))).toBe(true)
  })

  it('names the place: the office meeting room when left empty', () => {
    expect(isOfficeRoomMeeting(meeting)).toBe(true)
    expect(officeMeetingPlace(meeting)).toBe('사무실 회의실')
    expect(officeMeetingPlace({ location: ' 3층 대회의실 ' })).toBe('3층 대회의실')
  })

  it('invites seated people other than the organizer, one to eight at a time', () => {
    expect(validateOfficeMeetingStart(
      input({ title: '  주제  ', participantIds: ['member-02', previewMember.id, 'member-02'], location: ' 대회의실 ' }),
      previewMember,
      layout,
      presence,
      NOW,
    )).toEqual({ title: '주제', invitees: ['member-02'], startsAt: null, location: '대회의실' })
    const invalid: Array<[Partial<OfficeMeetingStartInput>, string]> = [
      [{ participantIds: [] }, OFFICE_MEETING_INVALID_MESSAGE],
      [{ participantIds: [previewMember.id] }, OFFICE_MEETING_INVALID_MESSAGE],
      [{ title: '가'.repeat(61) }, OFFICE_MEETING_INVALID_MESSAGE],
      [{ location: '가'.repeat(31) }, OFFICE_MEETING_INVALID_MESSAGE],
      [{ participantIds: ['not-seated'] }, OFFICE_MEETING_PARTICIPANT_MESSAGE],
      // 팀장은 읽기 전용이라 자리에 앉아 있어도 부를 수 없다(서버도 막는다).
      [{ participantIds: ['member-02', 'team-1'] }, OFFICE_MEETING_TEAM_LEADER_MESSAGE],
    ]
    for (const [overrides, message] of invalid) {
      expect(() => validateOfficeMeetingStart(input(overrides), previewMember, layout, presence, NOW)).toThrow(message)
    }
  })

  it('keeps people on vacation or a trip that day out of the meeting', () => {
    expect(() => validateOfficeMeetingStart(input({ participantIds: ['member-03'] }), previewMember, layout, presence, NOW))
      .toThrow(OFFICE_MEETING_AWAY_MESSAGE)
    // 잠깐 비운 상태(실험실)는 부를 수 있다.
    expect(validateOfficeMeetingStart(input({ participantIds: ['member-02'] }), previewMember, layout, presence, NOW).invitees)
      .toEqual(['member-02'])
  })

  it('starts now or later today in Seoul, never in the past or on another day', () => {
    const today = (clock: string) => `2026-09-27T${clock}:00+09:00`
    expect(validateOfficeMeetingStart(input({ startsAt: today('14:30') }), previewMember, layout, presence, NOW).startsAt)
      .toBe(new Date(today('14:30')).toISOString())
    // 몇 분 앞선 시각은 지금 바로로 친다(기기 시계 차이).
    expect(validateOfficeMeetingStart(input({ startsAt: today('09:57') }), previewMember, layout, presence, NOW).startsAt)
      .toBeNull()
    for (const startsAt of [today('09:30'), '2026-09-28T09:00:00+09:00', 'soon']) {
      expect(() => validateOfficeMeetingStart(input({ startsAt }), previewMember, layout, presence, NOW)).toThrow(OFFICE_MEETING_TIME_MESSAGE)
    }
  })

  it('parses the RPC envelope, including no meeting at all', () => {
    expect(parseOfficeMeeting(meeting)).toEqual({ meeting })
    expect(parseOfficeMeeting(null)).toEqual({ meeting: null })
    expect(parseOfficeMeeting({ ...meeting, participants: [{ user_id: 'x' }] })).toBeNull()
    expect(parseOfficeMeeting({ ...meeting, expires_at: 1 })).toBeNull()
    expect(parseOfficeMeeting({ ...meeting, location: null })).toBeNull()
    expect(parseOfficeMeeting('meeting')).toBeNull()
  })

  it('turns server codes into messages people understand', () => {
    const busy = translateOfficeMeetingError({ message: 'x', details: 'SQA_OFFICE_MEETING_BUSY' })
    expect(busy).toBeInstanceOf(UserFacingError)
    expect((busy as UserFacingError).message).toBe(OFFICE_MEETING_BUSY_MESSAGE)
    expect((translateOfficeMeetingError({ details: 'SQA_OFFICE_MEETING_PARTICIPANT_AWAY' }) as UserFacingError).message).toBe(OFFICE_MEETING_AWAY_MESSAGE)
    expect((translateOfficeMeetingError({ details: 'SQA_OFFICE_MEETING_TIME_INVALID' }) as UserFacingError).message).toBe(OFFICE_MEETING_TIME_MESSAGE)
    const unknown = { message: 'boom' }
    expect(translateOfficeMeetingError(unknown)).toBe(unknown)
  })
})
