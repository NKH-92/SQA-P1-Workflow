import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Profile } from '../../types'
import { createEmptyAppData } from '../appData'
import { createRepositoryContextFromDeps } from '../repositoryContext'
import { MEMBER_LEAVE_OVERLAP_MESSAGE, MEMBER_PRESENCE_FORBIDDEN_MESSAGE } from '../validation/memberPresence'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { rpc: mocks.rpc },
}))

import { addMemberLeave, deleteMemberLeave, setMemberStatus } from './presence'

const MEMBER = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const member: Profile = { id: MEMBER, email: 'member@example.com', name: '파트원', role: 'member', is_active: true }
const leader: Profile = { id: OTHER, email: 'leader@example.com', name: '파트장', role: 'leader', is_active: true }

const presence = {
  statuses: [{ profile_id: MEMBER, name: '파트원', status: 'lab', updated_at: '2026-09-27T01:00:00.000Z' }],
  leaves: [],
}

function remoteContext(profile: Profile = member) {
  let data: AppData = { ...createEmptyAppData(), profiles: [member, leader], memberPresence: { statuses: [], leaves: [] } }
  const setData = vi.fn((update: AppData | ((current: AppData) => AppData)) => {
    data = typeof update === 'function' ? update(data) : update
  })
  const ctx = createRepositoryContextFromDeps('remote', { profile, data, setData })
  return Object.assign(ctx, { applied: () => data })
}

function futureDay(days: number) {
  return new Date(Date.now() + days * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

describe('member presence RPCs (remote)', () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    mocks.rpc.mockImplementation(async (name: string) =>
      name === 'get_member_presence' ? { data: presence, error: null } : { data: 'ok', error: null })
  })

  it('sets my status, then reloads everyone’s presence', async () => {
    const ctx = remoteContext()
    await setMemberStatus(ctx, MEMBER, 'lab')
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'set_member_status', { p_profile_id: MEMBER, p_status: 'lab' })
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'get_member_presence')
    expect(ctx.applied().memberPresence).toEqual(presence)
  })

  it('stops a member from changing someone else before calling the server', async () => {
    await expect(setMemberStatus(remoteContext(), OTHER, 'lab')).rejects.toThrow(MEMBER_PRESENCE_FORBIDDEN_MESSAGE)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('sends a trimmed leave and explains overlaps', async () => {
    const ctx = remoteContext(leader)
    const startsOn = futureDay(2)
    await addMemberLeave(ctx, { profileId: MEMBER, kind: 'trip', startsOn, endsOn: startsOn, note: ' 오송 ' })
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'add_member_leave', {
      p_profile_id: MEMBER,
      p_kind: 'trip',
      p_starts_on: startsOn,
      p_ends_on: startsOn,
      p_note: '오송',
    })
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'overlap', details: 'SQA_MEMBER_LEAVE_OVERLAP' } })
    await expect(addMemberLeave(remoteContext(leader), { profileId: MEMBER, kind: 'trip', startsOn, endsOn: startsOn, note: '' }))
      .rejects.toThrow(MEMBER_LEAVE_OVERLAP_MESSAGE)
  })

  it('cancels a leave and reports when it was already gone', async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === 'get_member_presence' ? { data: presence, error: null } : { data: false, error: null })
    await expect(deleteMemberLeave(remoteContext(), 'leave-1')).resolves.toEqual({ removed: false })
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'delete_member_leave', { p_leave_id: 'leave-1' })
  })
})
