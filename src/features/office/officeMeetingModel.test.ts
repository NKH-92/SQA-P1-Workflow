import { describe, expect, it } from 'vitest'
import type { OfficeMeeting } from '../../types'
import {
  awaitsMyConfirmation,
  meetingProgress,
  meetingSceneState,
  meetingSummaryParts,
  meetingTimeSlots,
  meetingToast,
  nextMeetingChangeAt,
} from './officeMeetingModel'

/** 2026-09-27 11:00 서울 */
const NOW = Date.parse('2026-09-27T02:00:00.000Z')

const meeting: OfficeMeeting = {
  id: 'meeting-1',
  title: '',
  organizer_id: 'a',
  organizer_name: 'A',
  created_at: '2026-09-27T01:00:00.000Z',
  starts_at: '2026-09-27T01:00:00.000Z',
  location: '',
  expires_at: '2026-09-27T04:00:00.000Z',
  participants: [
    { user_id: 'a', name: 'A', acknowledged_at: '2026-09-27T01:00:00.000Z' },
    { user_id: 'b', name: 'B', acknowledged_at: null },
    { user_id: 'c', name: 'C', acknowledged_at: '2026-09-27T01:10:00.000Z' },
    { user_id: 'd', name: 'D', acknowledged_at: null },
  ],
}

const occupants = [
  { seatIndex: 7, profileId: 'c' },
  { seatIndex: 2, profileId: 'a' },
  { seatIndex: 5, profileId: 'b' },
  { seatIndex: 1, profileId: 'z' },
]

describe('office meeting model', () => {
  it('splits seated participants into people in the room and people still to confirm', () => {
    expect(meetingSceneState(meeting, occupants, NOW)).toEqual({ attendeeSeats: [2, 7], awaySeats: [], invitedSeats: [5] })
    expect(meetingSceneState(null, occupants, NOW)).toEqual({ attendeeSeats: [], awaySeats: [], invitedSeats: [] })
    expect(meetingSceneState(meeting, occupants, Date.parse('2026-09-27T05:00:00.000Z')).attendeeSeats).toEqual([])
  })

  it('keeps everyone at their desk until a scheduled meeting starts', () => {
    const scheduled = { ...meeting, starts_at: '2026-09-27T05:30:00.000Z', expires_at: '2026-09-27T08:30:00.000Z' }
    expect(meetingSceneState(scheduled, occupants, NOW)).toEqual({ attendeeSeats: [], awaySeats: [], invitedSeats: [5] })
    expect(meetingSceneState(scheduled, occupants, Date.parse('2026-09-27T05:31:00.000Z')).attendeeSeats).toEqual([2, 7])
    expect(nextMeetingChangeAt(scheduled, NOW)).toBe(Date.parse('2026-09-27T05:30:00.000Z'))
    expect(nextMeetingChangeAt(meeting, NOW)).toBe(Date.parse(meeting.expires_at))
    expect(nextMeetingChangeAt(null, NOW)).toBeNull()
  })

  it('shows people at a meeting elsewhere as away from their desk instead of in the room', () => {
    const elsewhere = { ...meeting, location: '3층 대회의실' }
    expect(meetingSceneState(elsewhere, occupants, NOW)).toEqual({ attendeeSeats: [], awaySeats: [2, 7], invitedSeats: [5] })
    expect(meetingSummaryParts(elsewhere, NOW)).toEqual(['3층 대회의실'])
    expect(meetingSummaryParts({ ...elsewhere, title: '일탈', starts_at: '2026-09-27T05:30:00.000Z' }, NOW))
      .toEqual(['오후 2:30', '3층 대회의실', '일탈'])
  })

  it('counts confirmations including people without a seat', () => {
    expect(meetingProgress(meeting)).toEqual({ confirmed: 2, total: 4 })
  })

  it('knows whether I still have to confirm', () => {
    expect(awaitsMyConfirmation(meeting, 'b', NOW)).toBe(true)
    expect(awaitsMyConfirmation(meeting, 'a', NOW)).toBe(false)
    expect(awaitsMyConfirmation(meeting, 'z', NOW)).toBe(false)
  })

  it('offers start times from the next ten minutes until the end of today in Seoul', () => {
    const slots = meetingTimeSlots(Date.parse('2026-09-27T02:03:00.000Z'))
    expect(slots[0]).toEqual({ value: '11:10', label: '오전 11:10', startsAt: '2026-09-27T02:10:00.000Z' })
    expect(slots[slots.length - 1]?.value).toBe('23:50')
    expect(meetingTimeSlots(Date.parse('2026-09-27T14:55:00.000Z'))).toEqual([])
  })

  it('tells what happened after confirming or ending', () => {
    expect(meetingToast('acknowledged', meeting, NOW)).toBe('회의 요청을 확인했어요. 사무실 회의실로 가 주세요.')
    expect(meetingToast('acknowledged', { ...meeting, starts_at: '2026-09-27T05:30:00.000Z', location: '현장' }, NOW))
      .toBe('회의 요청을 확인했어요. 오후 2:30에 현장에서 만나요.')
    expect(meetingToast('ended', meeting, NOW)).toBe('회의를 마쳤어요. 회의실이 비었어요.')
    expect(meetingToast('ended', { ...meeting, starts_at: '2026-09-27T05:30:00.000Z' }, NOW)).toBe('회의를 취소했어요.')
  })
})
