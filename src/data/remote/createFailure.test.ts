import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserFacingError } from '../../lib/errors'
import type { AppData, Profile } from '../../types'
import type { RepositoryDeps } from '../repositories/types'

const mocks = vi.hoisted(() => {
  const insertSingle = vi.fn()
  const insertSelect = vi.fn(() => ({ single: insertSingle }))
  const insert = vi.fn()
  const from = vi.fn(() => ({ insert }))
  return { insertSingle, insertSelect, insert, from }
})

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { from: mocks.from },
}))

import { POSSIBLY_SAVED_MESSAGE, throwIfPossiblySaved } from './createFailure'
import { createSupabaseAnnouncementRepository } from './supabaseAnnouncementRepository'
import { createSupabaseTeamRepository } from './supabaseTeamRepository'

const leader: Profile = { id: 'leader-1', email: 'leader@example.com', name: 'Leader', role: 'leader' }
/** postgrest가 fetch 실패를 돌려주는 모양(Error가 아닌 일반 객체) */
const networkFailure = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }
const serverFailure = { message: 'new row violates row-level security policy', details: '', hint: '', code: '42501' }

function deps(): RepositoryDeps {
  return {
    profile: leader,
    data: { announcements: [], profileNotes: [] } as unknown as AppData,
    setData: vi.fn(),
  } as unknown as RepositoryDeps
}

describe('throwIfPossiblySaved', () => {
  it('turns only network failures into the possibly-saved message', () => {
    expect(() => throwIfPossiblySaved(networkFailure)).toThrow(UserFacingError)
    expect(() => throwIfPossiblySaved(networkFailure)).toThrow(POSSIBLY_SAVED_MESSAGE)
    expect(() => throwIfPossiblySaved(new TypeError('Failed to fetch'))).toThrow(POSSIBLY_SAVED_MESSAGE)
    expect(() => throwIfPossiblySaved(serverFailure)).not.toThrow()
    expect(() => throwIfPossiblySaved(new UserFacingError('다른 안내'))).not.toThrow()
  })

  it('treats a request timeout (AbortError) as possibly saved too', () => {
    // supabase db.timeout으로 끊기면 postgrest는 이런 일반 객체를 돌려준다.
    const timeoutFailure = { message: 'AbortError: signal is aborted without reason', details: '', hint: '', code: '' }
    expect(() => throwIfPossiblySaved(timeoutFailure)).toThrow(POSSIBLY_SAVED_MESSAGE)
    expect(() => throwIfPossiblySaved(new DOMException('signal is aborted without reason', 'AbortError'))).toThrow(POSSIBLY_SAVED_MESSAGE)
  })
})

describe('create paths after a dropped connection', () => {
  beforeEach(() => {
    mocks.insertSingle.mockReset()
    mocks.insert.mockReset().mockImplementation(() => ({ select: mocks.insertSelect }))
  })

  it('asks to check the announcement list before posting again', async () => {
    mocks.insertSingle.mockResolvedValueOnce({ data: null, error: networkFailure })
    await expect(createSupabaseAnnouncementRepository(deps()).saveAnnouncement({
      editingAnnouncementId: null,
      expectedUpdatedAt: null,
      payload: { title: '공지', body: '내용', is_pinned: false },
    })).rejects.toThrow(POSSIBLY_SAVED_MESSAGE)

    mocks.insertSingle.mockResolvedValueOnce({ data: null, error: serverFailure })
    await expect(createSupabaseAnnouncementRepository(deps()).saveAnnouncement({
      editingAnnouncementId: null,
      expectedUpdatedAt: null,
      payload: { title: '공지', body: '내용', is_pinned: false },
    })).rejects.toBe(serverFailure)
  })

  it('asks to check the member notes before adding the note again', async () => {
    mocks.insert.mockResolvedValueOnce({ error: networkFailure })
    await expect(createSupabaseTeamRepository(deps()).addProfileNote({ profileId: 'member-1', note: '메모' }))
      .rejects.toThrow(POSSIBLY_SAVED_MESSAGE)

    mocks.insert.mockResolvedValueOnce({ error: serverFailure })
    await expect(createSupabaseTeamRepository(deps()).addProfileNote({ profileId: 'member-1', note: '메모' }))
      .rejects.toBe(serverFailure)
  })
})
