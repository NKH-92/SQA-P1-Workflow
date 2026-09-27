import { describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../../demoData'
import { PERMISSION_MESSAGE } from '../../lib/errors'
import type { AppData, Profile } from '../../types'
import { createRepositoryContextFromDeps, type RepositoryContext } from '../repositoryContext'
import {
  OFFICE_MEETING_AWAY_MESSAGE,
  OFFICE_MEETING_BUSY_MESSAGE,
  OFFICE_MEETING_FORBIDDEN_MESSAGE,
  OFFICE_MEETING_GONE_MESSAGE,
  OFFICE_MEETING_PARTICIPANT_MESSAGE,
  type OfficeMeetingStartInput,
} from '../validation/officeMeeting'
import { acknowledgeOfficeMeeting, endOfficeMeeting, startOfficeMeeting } from './meetings'

function office(): { data: () => AppData; as: (profile: Profile) => RepositoryContext } {
  let data = createPreviewData()
  const setData = vi.fn((update: AppData | ((current: AppData) => AppData)) => {
    data = typeof update === 'function' ? update(data) : update
  })
  return {
    data: () => data,
    as: (profile) => createRepositoryContextFromDeps('local', { profile, data, setData }),
  }
}

/** 미리보기 사무실: 2번 파트원 A, 3번 파트장, 6번 파트원 B(오늘부터 출장), 7번 파트원 C(실험실) */
const memberB = 'member-02'
const memberC = createPreviewData().officeLayout!.seats.find((seat) => seat.seat_index === 7)!.profile_id

function start(overrides: Partial<OfficeMeetingStartInput>): OfficeMeetingStartInput {
  return { title: '', participantIds: [memberC], startsAt: null, location: '', ...overrides }
}

describe('local office meeting parity', () => {
  it('opens one meeting for seated people with the organizer already confirmed', async () => {
    const room = office()
    await startOfficeMeeting(room.as(previewMember), start({ title: ' 5분 논의 ' }))
    const meeting = room.data().officeMeeting!
    expect(meeting).toMatchObject({ title: '5분 논의', organizer_id: previewMember.id, location: '' })
    expect(meeting.starts_at).toBe(meeting.created_at)
    expect(meeting.participants.map((participant) => [participant.user_id, Boolean(participant.acknowledged_at)])).toEqual([
      [previewMember.id, true],
      [memberC, false],
    ])
    expect(Date.parse(meeting.expires_at) - Date.parse(meeting.starts_at)).toBe(3 * 60 * 60 * 1000)

    await expect(startOfficeMeeting(room.as(previewLeader), start({ participantIds: [previewMember.id] })))
      .rejects.toThrow(OFFICE_MEETING_BUSY_MESSAGE)
  })

  it('refuses team leaders and people who are not seated', async () => {
    const room = office()
    await expect(startOfficeMeeting(room.as({ ...previewLeader, role: 'team_leader' }), start({})))
      .rejects.toThrow(PERMISSION_MESSAGE)
    await expect(startOfficeMeeting(room.as(previewMember), start({ participantIds: ['member-99'] })))
      .rejects.toThrow(OFFICE_MEETING_PARTICIPANT_MESSAGE)
    // 출장 중인 파트원 B는 부를 수 없다.
    await expect(startOfficeMeeting(room.as(previewMember), start({ participantIds: [memberB] })))
      .rejects.toThrow(OFFICE_MEETING_AWAY_MESSAGE)
    expect(room.data().officeMeeting).toBeNull()
  })

  it('lets invitees confirm and only the organizer or the leader end it', async () => {
    const room = office()
    await startOfficeMeeting(room.as(previewMember), start({}))
    const meetingId = room.data().officeMeeting!.id

    await acknowledgeOfficeMeeting(room.as({ ...previewMember, id: memberC, name: '파트원 C' }), meetingId)
    expect(room.data().officeMeeting!.participants.every((participant) => participant.acknowledged_at)).toBe(true)
    await expect(acknowledgeOfficeMeeting(room.as(previewLeader), meetingId)).rejects.toThrow(OFFICE_MEETING_GONE_MESSAGE)

    await expect(endOfficeMeeting(room.as({ ...previewMember, id: memberC }), meetingId)).rejects.toThrow(OFFICE_MEETING_FORBIDDEN_MESSAGE)
    await expect(endOfficeMeeting(room.as(previewLeader), meetingId)).resolves.toEqual({ ended: true })
    expect(room.data().officeMeeting).toBeNull()
    await expect(endOfficeMeeting(room.as(previewLeader), meetingId)).resolves.toEqual({ ended: false })
  })

  it('schedules a meeting later today somewhere else and expires it three hours after the start', async () => {
    const room = office()
    const later = new Date(Date.now() + 90 * 60 * 1000)
    // 자정을 넘기면 오늘 안의 시각이 아니므로, 이 검사는 오늘 안에 들어갈 때만 확인한다.
    const sameDay = later.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
    if (!sameDay) return
    await startOfficeMeeting(room.as(previewLeader), start({ startsAt: later.toISOString(), location: ' 3층 대회의실 ' }))
    const meeting = room.data().officeMeeting!
    expect(meeting).toMatchObject({ location: '3층 대회의실', starts_at: later.toISOString() })
    expect(Date.parse(meeting.expires_at) - later.getTime()).toBe(3 * 60 * 60 * 1000)
  })
})
