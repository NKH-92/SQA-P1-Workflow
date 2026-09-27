import { describe, expect, it } from 'vitest'
import { previewLeader, previewMember } from '../../demoData'
import { UserFacingError } from '../../lib/errors'
import type { MemberPresence } from '../../types'
import {
  canEditPresence,
  hasPresence,
  leavePeriodLabel,
  leaveUntilLabel,
  MEMBER_LEAVE_INVALID_MESSAGE,
  MEMBER_LEAVE_NOTE_MESSAGE,
  MEMBER_LEAVE_OVERLAP_MESSAGE,
  MEMBER_PRESENCE_FORBIDDEN_MESSAGE,
  parseMemberPresence,
  presenceChipLabel,
  presenceOf,
  presenceSummary,
  translateMemberPresenceError,
  upcomingLeaves,
  validateMemberLeave,
  type MemberLeaveInput,
} from './memberPresence'

const TODAY = '2026-09-27'
/** 2026-09-27 10:00 서울 */
const NOW = new Date('2026-09-27T01:00:00.000Z')

const presence: MemberPresence = {
  statuses: [
    { profile_id: 'a', name: 'A', status: 'lab', updated_at: '2026-09-27T00:30:00.000Z' },
    { profile_id: 'b', name: 'B', status: 'field', updated_at: '2026-09-27T00:40:00.000Z' },
  ],
  leaves: [
    { id: 'l1', profile_id: 'b', name: 'B', kind: 'trip', starts_on: '2026-09-26', ends_on: '2026-09-28', note: '오송' },
    { id: 'l2', profile_id: 'c', name: 'C', kind: 'vacation', starts_on: '2026-10-05', ends_on: '2026-10-07', note: '' },
    { id: 'l3', profile_id: 'c', name: 'C', kind: 'trip', starts_on: '2026-09-29', ends_on: '2026-09-29', note: '' },
  ],
}

function leave(overrides: Partial<MemberLeaveInput>): MemberLeaveInput {
  return { profileId: 'c', kind: 'vacation', startsOn: '2026-10-01', endsOn: '2026-10-02', note: '', ...overrides }
}

describe('member presence rules', () => {
  it('shows a vacation or trip before a short status, and nothing when someone is at their desk', () => {
    expect(presenceOf(presence, 'a', TODAY)).toEqual({ kind: 'lab', since: '2026-09-27T00:30:00.000Z' })
    // 출장 기간에는 짧은 상태(현장)보다 출장이 보인다.
    expect(presenceOf(presence, 'b', TODAY)).toMatchObject({ kind: 'trip', leave: { id: 'l1' } })
    expect(presenceOf(presence, 'b', '2026-09-29')).toMatchObject({ kind: 'field' })
    expect(presenceOf(presence, 'c', TODAY)).toBeNull()
    expect(presenceOf(undefined, 'a', TODAY)).toBeNull()
  })

  it('lists current and upcoming leaves in date order', () => {
    expect(upcomingLeaves(presence, 'c', TODAY).map((item) => item.id)).toEqual(['l3', 'l2'])
    expect(upcomingLeaves(presence, 'b', '2026-09-29')).toEqual([])
  })

  it('writes short labels for chips and name tags', () => {
    expect(presenceSummary(presenceOf(presence, 'b', TODAY)!, TODAY)).toBe('출장 · 9월 28일까지')
    expect(presenceSummary(presenceOf(presence, 'a', TODAY)!, TODAY)).toBe('실험실')
    expect(leaveUntilLabel({ ends_on: TODAY }, TODAY)).toBe('오늘까지')
    // 사무실 자리 칩은 더 짧게 쓴다.
    expect(presenceChipLabel(presenceOf(presence, 'b', TODAY)!, TODAY)).toBe('출장 ~9/28')
    expect(presenceChipLabel(presenceOf(presence, 'b', TODAY)!, '2026-09-28')).toBe('출장 오늘까지')
    expect(presenceChipLabel(presenceOf(presence, 'a', TODAY)!, TODAY)).toBe('실험실')
    expect(leavePeriodLabel({ starts_on: '2026-10-05', ends_on: '2026-10-07' })).toBe('10월 5일~10월 7일')
    expect(leavePeriodLabel({ starts_on: '2026-09-29', ends_on: '2026-09-29' })).toBe('9월 29일')
  })

  it('lets people change their own presence and the leader change anyone’s, but never team leaders', () => {
    const member = { ...previewMember, id: 'a' }
    const other = { id: 'b', role: 'member' as const, is_active: true }
    expect(canEditPresence(member, member)).toBe(true)
    expect(canEditPresence(member, other)).toBe(false)
    expect(canEditPresence(previewLeader, other)).toBe(true)
    expect(canEditPresence(previewLeader, { id: 't', role: 'team_leader', is_active: true })).toBe(false)
    expect(canEditPresence({ ...previewLeader, role: 'team_leader' }, { ...previewLeader, role: 'team_leader' })).toBe(false)
    expect(canEditPresence({ ...member, must_change_password: true }, member)).toBe(false)
    expect(hasPresence({ role: 'team_leader', is_active: true })).toBe(false)
    expect(hasPresence({ role: 'member', is_active: false })).toBe(false)
  })

  it('accepts whole days from today up to ninety days and trims the note', () => {
    expect(validateMemberLeave(leave({ note: '  반차  ' }), presence, NOW)).toEqual(leave({ note: '반차' }))
    expect(validateMemberLeave(leave({ startsOn: '2026-09-20', endsOn: TODAY }), presence, NOW).endsOn).toBe(TODAY)
    const invalid: Array<[Partial<MemberLeaveInput>, string]> = [
      [{ startsOn: '2026-10-03', endsOn: '2026-10-02' }, MEMBER_LEAVE_INVALID_MESSAGE],
      [{ startsOn: '2026-09-20', endsOn: '2026-09-26' }, MEMBER_LEAVE_INVALID_MESSAGE],
      [{ startsOn: '2026-10-01', endsOn: '2026-12-30' }, MEMBER_LEAVE_INVALID_MESSAGE],
      [{ startsOn: '2027-12-01', endsOn: '2027-12-02' }, MEMBER_LEAVE_INVALID_MESSAGE],
      [{ startsOn: '2026-02-30' }, MEMBER_LEAVE_INVALID_MESSAGE],
      [{ note: '가'.repeat(31) }, MEMBER_LEAVE_NOTE_MESSAGE],
      [{ startsOn: '2026-10-06', endsOn: '2026-10-09' }, MEMBER_LEAVE_OVERLAP_MESSAGE],
    ]
    for (const [overrides, message] of invalid) {
      expect(() => validateMemberLeave(leave(overrides), presence, NOW)).toThrow(message)
    }
    // 90일째(첫날·마지막 날 포함)까지는 된다.
    expect(validateMemberLeave(leave({ startsOn: '2026-10-01', endsOn: '2026-12-29' }), { statuses: [], leaves: [] }, NOW).endsOn).toBe('2026-12-29')
  })

  it('parses the RPC envelope and rejects anything malformed', () => {
    expect(parseMemberPresence(presence)).toEqual(presence)
    expect(parseMemberPresence({ statuses: [], leaves: [{ ...presence.leaves[0], starts_on: '2026-09-26T00:00:00' }] })?.leaves[0].starts_on)
      .toBe('2026-09-26')
    expect(parseMemberPresence({ statuses: [{ ...presence.statuses[0], status: 'lunch' }], leaves: [] })).toBeNull()
    expect(parseMemberPresence({ statuses: [], leaves: [{ ...presence.leaves[0], kind: 'sick' }] })).toBeNull()
    expect(parseMemberPresence({ statuses: [] })).toBeNull()
    expect(parseMemberPresence(null)).toBeNull()
  })

  it('turns server codes into messages people understand', () => {
    expect((translateMemberPresenceError({ details: 'SQA_MEMBER_LEAVE_OVERLAP' }) as UserFacingError).message).toBe(MEMBER_LEAVE_OVERLAP_MESSAGE)
    expect((translateMemberPresenceError({ details: 'SQA_MEMBER_PRESENCE_FORBIDDEN' }) as UserFacingError).message).toBe(MEMBER_PRESENCE_FORBIDDEN_MESSAGE)
    const unknown = { message: 'boom' }
    expect(translateMemberPresenceError(unknown)).toBe(unknown)
  })
})
