import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSION_MESSAGE, UserFacingError } from '../../lib/errors'
import type { AppData, Profile } from '../../types'
import { createEmptyAppData } from '../appData'
import { createRepositoryContextFromDeps } from '../repositoryContext'
import {
  OFFICE_LAYOUT_STALE_MESSAGE,
  OFFICE_SEAT_DUPLICATE_MESSAGE,
  OFFICE_SEAT_INACTIVE_MESSAGE,
  OFFICE_SEATS_INVALID_MESSAGE,
} from '../validation/officeSeats'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { rpc: mocks.rpc },
}))

import { replaceOfficeSeats } from './office'

const LEADER = '11111111-1111-4111-8111-111111111111'
const MEMBER = '22222222-2222-4222-8222-222222222222'
const leader: Profile = { id: LEADER, email: 'leader@example.com', name: '파트장', role: 'leader', is_active: true }
const member: Profile = { id: MEMBER, email: 'member@example.com', name: '파트원', role: 'member', is_active: true }

function remoteContext() {
  const data: AppData = { ...createEmptyAppData(), profiles: [leader, member] }
  return createRepositoryContextFromDeps('remote', { profile: leader, data, setData: vi.fn() })
}

describe('office seat mutation contract (remote)', () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    mocks.rpc.mockResolvedValue({ data: true, error: null })
  })

  it('sends only the seat fields and the revision the editor opened with', async () => {
    const result = await replaceOfficeSeats(remoteContext(), {
      expectedRevision: 'rev-1',
      seats: [{ seat_index: 3, profile_id: MEMBER, gender: 'male', style_seed: 99, name: 'extra' } as never],
    })
    expect(result).toEqual({ changed: true })
    expect(mocks.rpc).toHaveBeenCalledWith('replace_office_seats', {
      p_seats: [{ seat_index: 3, profile_id: MEMBER, gender: 'male', style_seed: 99 }],
      p_expected_revision: 'rev-1',
    })
  })

  it('reports a server no-op', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null })
    await expect(replaceOfficeSeats(remoteContext(), { expectedRevision: 'rev-1', seats: [] })).resolves.toEqual({ changed: false })
  })

  it('checks ids before calling the server', async () => {
    await expect(replaceOfficeSeats(remoteContext(), {
      expectedRevision: 'rev-1',
      seats: [{ seat_index: 1, profile_id: 'not-a-uuid', gender: 'male', style_seed: 1 }],
    })).rejects.toThrow(OFFICE_SEATS_INVALID_MESSAGE)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['SQA_OFFICE_LAYOUT_CONFLICT', OFFICE_LAYOUT_STALE_MESSAGE],
    ['SQA_OFFICE_SEATS_DUPLICATE', OFFICE_SEAT_DUPLICATE_MESSAGE],
    ['SQA_OFFICE_SEAT_PROFILE_INACTIVE', OFFICE_SEAT_INACTIVE_MESSAGE],
    ['SQA_OFFICE_SEATS_INVALID', OFFICE_SEATS_INVALID_MESSAGE],
    ['SQA_ACTIVE_LEADER_REQUIRED', PERMISSION_MESSAGE],
    ['SQA_TEAM_LEADER_READ_ONLY', PERMISSION_MESSAGE],
  ])('turns %s into a user-facing message', async (detail, message) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'failed', details: detail } })
    const failure = replaceOfficeSeats(remoteContext(), { expectedRevision: 'rev-1', seats: [] })
    await expect(failure).rejects.toBeInstanceOf(UserFacingError)
    await expect(failure).rejects.toThrow(message)
  })

  it('passes unknown server errors through unchanged', async () => {
    const error = { code: '08006', message: 'connection lost', details: '' }
    mocks.rpc.mockResolvedValue({ data: null, error })
    await expect(replaceOfficeSeats(remoteContext(), { expectedRevision: 'rev-1', seats: [] })).rejects.toBe(error)
  })
})
