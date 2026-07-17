import { describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../../demoData'
import type { RepositoryContext } from '../repositoryContext'
import { addProfileNote } from './team'

function context(profile = previewLeader): RepositoryContext {
  return { isRemote: false, profile, data: createPreviewData(), setData: vi.fn() }
}

describe('local profile-note permission parity', () => {
  it('requires an active leader', async () => {
    const ctx = context(previewMember)

    await expect(addProfileNote(ctx, { profileId: previewMember.id, note: 'blocked' })).rejects.toThrow(
      '활성 파트장 권한이 필요합니다.',
    )
    expect(ctx.setData).not.toHaveBeenCalled()
  })

  it('rejects a missing or non-member target', async () => {
    const missing = context()
    await expect(addProfileNote(missing, { profileId: 'missing-profile', note: 'blocked' })).rejects.toThrow()

    const leaderTarget = context()
    await expect(addProfileNote(leaderTarget, { profileId: previewLeader.id, note: 'blocked' })).rejects.toThrow(
      '파트원에게만 메모를 남길 수 있습니다.',
    )
    expect(missing.setData).not.toHaveBeenCalled()
    expect(leaderTarget.setData).not.toHaveBeenCalled()
  })

  it('allows an active leader to add a member note', async () => {
    const ctx = context()

    await addProfileNote(ctx, { profileId: previewMember.id, note: 'allowed' })

    expect(ctx.setData).toHaveBeenCalledOnce()
  })
})
