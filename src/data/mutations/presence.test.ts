import { describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../../demoData'
import { businessDateKey } from '../../lib/businessTime'
import { PERMISSION_MESSAGE } from '../../lib/errors'
import type { AppData, Profile } from '../../types'
import { createRepositoryContextFromDeps, type RepositoryContext } from '../repositoryContext'
import {
  MEMBER_LEAVE_OVERLAP_MESSAGE,
  MEMBER_PRESENCE_FORBIDDEN_MESSAGE,
  MEMBER_PRESENCE_TARGET_MESSAGE,
} from '../validation/memberPresence'
import { addMemberLeave, deleteMemberLeave, setMemberStatus } from './presence'

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

function inDays(days: number) {
  const date = new Date(`${businessDateKey(new Date())}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const memberB = 'member-02'

describe('local presence parity', () => {
  it('sets and clears my own short status', async () => {
    const room = office()
    await setMemberStatus(room.as(previewMember), previewMember.id, 'field')
    expect(room.data().memberPresence!.statuses.find((status) => status.profile_id === previewMember.id)).toMatchObject({ status: 'field', name: previewMember.name })
    await setMemberStatus(room.as(previewMember), previewMember.id, 'away')
    expect(room.data().memberPresence!.statuses.filter((status) => status.profile_id === previewMember.id)).toHaveLength(1)
    await setMemberStatus(room.as(previewMember), previewMember.id, null)
    expect(room.data().memberPresence!.statuses.some((status) => status.profile_id === previewMember.id)).toBe(false)
  })

  it('lets only the leader change someone else, and never for team leaders', async () => {
    const room = office()
    await expect(setMemberStatus(room.as(previewMember), memberB, 'lab')).rejects.toThrow(MEMBER_PRESENCE_FORBIDDEN_MESSAGE)
    await setMemberStatus(room.as(previewLeader), memberB, 'lab')
    expect(room.data().memberPresence!.statuses.find((status) => status.profile_id === memberB)?.status).toBe('lab')
    await expect(setMemberStatus(room.as({ ...previewLeader, role: 'team_leader' }), previewLeader.id, 'lab')).rejects.toThrow(PERMISSION_MESSAGE)
    await expect(setMemberStatus(room.as(previewLeader), 'member-99', 'lab')).rejects.toThrow(MEMBER_PRESENCE_TARGET_MESSAGE)
  })

  it('registers and cancels a vacation, refusing overlaps', async () => {
    const room = office()
    await addMemberLeave(room.as(previewMember), { profileId: previewMember.id, kind: 'vacation', startsOn: inDays(3), endsOn: inDays(4), note: ' 가족 여행 ' })
    const added = room.data().memberPresence!.leaves.find((item) => item.profile_id === previewMember.id)!
    expect(added).toMatchObject({ kind: 'vacation', starts_on: inDays(3), ends_on: inDays(4), note: '가족 여행' })
    await expect(addMemberLeave(room.as(previewMember), { profileId: previewMember.id, kind: 'trip', startsOn: inDays(4), endsOn: inDays(6), note: '' }))
      .rejects.toThrow(MEMBER_LEAVE_OVERLAP_MESSAGE)

    await expect(deleteMemberLeave(room.as({ ...previewMember, id: memberB, name: '파트원 B' }), added.id)).rejects.toThrow(MEMBER_PRESENCE_FORBIDDEN_MESSAGE)
    await expect(deleteMemberLeave(room.as(previewMember), added.id)).resolves.toEqual({ removed: true })
    await expect(deleteMemberLeave(room.as(previewMember), added.id)).resolves.toEqual({ removed: false })
  })
})
