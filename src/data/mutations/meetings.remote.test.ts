import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Profile } from '../../types'
import { createEmptyAppData } from '../appData'
import { createRepositoryContextFromDeps } from '../repositoryContext'
import { OFFICE_MEETING_BUSY_MESSAGE, OFFICE_MEETING_PARTICIPANT_MESSAGE } from '../validation/officeMeeting'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { rpc: mocks.rpc },
}))

import { acknowledgeOfficeMeeting, endOfficeMeeting, startOfficeMeeting } from './meetings'

const MEMBER = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const member: Profile = { id: MEMBER, email: 'member@example.com', name: '파트원', role: 'member', is_active: true }

const openMeeting = {
  id: 'meeting-1',
  title: '',
  organizer_id: MEMBER,
  organizer_name: '파트원',
  created_at: '2026-09-27T01:00:00.000Z',
  starts_at: '2026-09-27T01:00:00.000Z',
  location: '',
  expires_at: '2026-09-27T04:00:00.000Z',
  participants: [
    { user_id: MEMBER, name: '파트원', acknowledged_at: '2026-09-27T01:00:00.000Z' },
    { user_id: OTHER, name: '동료', acknowledged_at: null },
  ],
}

function remoteContext() {
  let data: AppData = {
    ...createEmptyAppData(),
    profiles: [member],
    officeLayout: {
      revision: 'r1',
      seats: [
        { seat_index: 1, profile_id: MEMBER, name: '파트원', gender: 'female', style_seed: 1 },
        { seat_index: 2, profile_id: OTHER, name: '동료', gender: 'male', style_seed: 2 },
      ],
    },
    officeMeeting: null,
  }
  const setData = vi.fn((update: AppData | ((current: AppData) => AppData)) => {
    data = typeof update === 'function' ? update(data) : update
  })
  const ctx = createRepositoryContextFromDeps('remote', { profile: member, data, setData })
  return Object.assign(ctx, { applied: () => data })
}

describe('office meeting RPCs (remote)', () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
  })

  it('sends the trimmed title and invitees, then reloads the room', async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === 'get_office_meeting' ? { data: openMeeting, error: null } : { data: 'meeting-1', error: null })
    const ctx = remoteContext()
    await startOfficeMeeting(ctx, { title: '  논의  ', participantIds: [OTHER, MEMBER], startsAt: null, location: ' 대회의실 ' })
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'start_office_meeting', {
      p_title: '논의',
      p_participant_ids: [OTHER],
      p_starts_at: null,
      p_location: '대회의실',
    })
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'get_office_meeting')
    expect(ctx.applied().officeMeeting).toEqual(openMeeting)
  })

  it('checks invitees against the seats before calling the server', async () => {
    const ctx = remoteContext()
    await expect(startOfficeMeeting(ctx, { title: '', participantIds: ['44444444-4444-4444-8444-444444444444'], startsAt: null, location: '' }))
      .rejects.toThrow(OFFICE_MEETING_PARTICIPANT_MESSAGE)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('explains a busy room', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'the meeting room is in use', details: 'SQA_OFFICE_MEETING_BUSY' } })
    await expect(startOfficeMeeting(remoteContext(), { title: '', participantIds: [OTHER], startsAt: null, location: '' }))
      .rejects.toThrow(OFFICE_MEETING_BUSY_MESSAGE)
  })

  it('confirms and ends through their RPCs', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'get_office_meeting') return { data: null, error: null }
      if (name === 'end_office_meeting') return { data: true, error: null }
      return { data: '2026-09-27T01:05:00.000Z', error: null }
    })
    const ctx = remoteContext()
    await acknowledgeOfficeMeeting(ctx, 'meeting-1')
    expect(mocks.rpc).toHaveBeenCalledWith('acknowledge_office_meeting', { p_meeting_id: 'meeting-1' })
    await expect(endOfficeMeeting(ctx, 'meeting-1')).resolves.toEqual({ ended: true })
    expect(mocks.rpc).toHaveBeenCalledWith('end_office_meeting', { p_meeting_id: 'meeting-1' })
    expect(ctx.applied().officeMeeting).toBeNull()
  })
})
