import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Profile } from '../../types'
import { createEmptyAppData } from '../appData'
import { createRepositoryContextFromDeps } from '../repositoryContext'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { rpc: mocks.rpc },
}))

import { markSectionSeen } from './readMarks'

const MEMBER = '22222222-2222-4222-8222-222222222222'
const KEY_A = '33333333-3333-4333-8333-333333333333'
const KEY_B = '44444444-4444-4444-8444-444444444444'
const member: Profile = { id: MEMBER, email: 'member@example.com', name: '파트원', role: 'member', is_active: true }

function remoteContext() {
  let data: AppData = { ...createEmptyAppData(), profiles: [member], sectionReadMarks: [] }
  const setData = vi.fn((update: AppData | ((current: AppData) => AppData)) => {
    data = typeof update === 'function' ? update(data) : update
  })
  const ctx = createRepositoryContextFromDeps('remote', { profile: member, data, setData })
  return Object.assign(ctx, { applied: () => data })
}

describe('section read marks (remote)', () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    mocks.rpc.mockResolvedValue({ data: '2026-09-27T03:00:00.123Z', error: null })
  })

  it('sends unique uuid keys and keeps the database time as the mark time', async () => {
    const ctx = remoteContext()
    await markSectionSeen(ctx, 'change-applications', [KEY_A, 'not-a-uuid', KEY_B, KEY_A])
    expect(mocks.rpc).toHaveBeenCalledWith('mark_section_seen', {
      p_section: 'change-applications',
      p_keys: [KEY_A, KEY_B],
    })
    expect(ctx.applied().sectionReadMarks).toEqual([{
      user_id: MEMBER,
      section: 'change-applications',
      seen_keys: [KEY_A, KEY_B],
      seen_at: '2026-09-27T03:00:00.123Z',
    }])
  })

  it('leaves the local marks alone when the server refuses', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'team leader access is read only', details: 'SQA_TEAM_LEADER_READ_ONLY' } })
    const ctx = remoteContext()
    await expect(markSectionSeen(ctx, 'projects', [KEY_A])).rejects.toMatchObject({ details: 'SQA_TEAM_LEADER_READ_ONLY' })
    expect(ctx.setData).not.toHaveBeenCalled()
  })
})
