import { describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../../demoData'
import { PERMISSION_MESSAGE } from '../../lib/errors'
import type { AppData, Profile } from '../../types'
import { createRepositoryContextFromDeps, type RepositoryContext } from '../repositoryContext'
import { OFFICE_LAYOUT_STALE_MESSAGE, OFFICE_SEAT_DUPLICATE_MESSAGE } from '../validation/officeSeats'
import { replaceOfficeSeats } from './office'

function context(profile: Profile = previewLeader): RepositoryContext & { applied: () => AppData } {
  let data = createPreviewData()
  const setData = vi.fn((update: AppData | ((current: AppData) => AppData)) => {
    data = typeof update === 'function' ? update(data) : update
  })
  const ctx = createRepositoryContextFromDeps('local', { profile, data, setData })
  return Object.assign(ctx, { applied: () => data })
}

describe('local office seat parity', () => {
  it('lets only an active leader with a current password change the layout', async () => {
    const blocked: Profile[] = [
      previewMember,
      { ...previewLeader, role: 'team_leader' },
      { ...previewLeader, is_active: false },
      { ...previewLeader, must_change_password: true },
    ]
    for (const profile of blocked) {
      const ctx = context(profile)
      await expect(replaceOfficeSeats(ctx, { seats: [], expectedRevision: ctx.data.officeLayout!.revision })).rejects.toThrow(
        PERMISSION_MESSAGE,
      )
      expect(ctx.setData).not.toHaveBeenCalled()
    }
  })

  it('rejects a layout that changed after the editor opened', async () => {
    const ctx = context()
    await expect(replaceOfficeSeats(ctx, { seats: [], expectedRevision: 'stale' })).rejects.toThrow(OFFICE_LAYOUT_STALE_MESSAGE)
    expect(ctx.setData).not.toHaveBeenCalled()
  })

  it('replaces the whole layout with display names and a new revision', async () => {
    const ctx = context()
    const before = ctx.data.officeLayout!
    const result = await replaceOfficeSeats(ctx, {
      expectedRevision: before.revision,
      seats: [
        { seat_index: 8, profile_id: previewMember.id, gender: 'male', style_seed: 3 },
        { seat_index: 1, profile_id: previewLeader.id, gender: 'female', style_seed: 4 },
      ],
    })
    expect(result).toEqual({ changed: true })
    const after = ctx.applied().officeLayout!
    expect(after.revision).not.toBe(before.revision)
    expect(after.seats).toEqual([
      { seat_index: 1, profile_id: previewLeader.id, name: previewLeader.name, gender: 'female', style_seed: 4 },
      { seat_index: 8, profile_id: previewMember.id, name: previewMember.name, gender: 'male', style_seed: 3 },
    ])
  })

  it('reports a true no-op without touching data', async () => {
    const ctx = context()
    const current = ctx.data.officeLayout!
    const result = await replaceOfficeSeats(ctx, {
      expectedRevision: current.revision,
      seats: current.seats.map(({ seat_index, profile_id, gender, style_seed }) => ({ seat_index, profile_id, gender, style_seed })),
    })
    expect(result).toEqual({ changed: false })
    expect(ctx.setData).not.toHaveBeenCalled()
  })

  it('applies the same validation as the server', async () => {
    const ctx = context()
    await expect(replaceOfficeSeats(ctx, {
      expectedRevision: ctx.data.officeLayout!.revision,
      seats: [
        { seat_index: 1, profile_id: previewMember.id, gender: 'male', style_seed: 1 },
        { seat_index: 2, profile_id: previewMember.id, gender: 'male', style_seed: 1 },
      ],
    })).rejects.toThrow(OFFICE_SEAT_DUPLICATE_MESSAGE)
  })
})
