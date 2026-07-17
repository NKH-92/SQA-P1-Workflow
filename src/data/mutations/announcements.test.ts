import { describe, expect, it } from 'vitest'
import { STALE_WRITE_MESSAGE, UserFacingError } from '../../lib/errors'
import type { Announcement, AppData, Profile } from '../../types'
import type { RepositoryContext } from '../repositoryContext'
import { deleteAnnouncement, saveAnnouncement, toggleAnnouncementPin } from './announcements'

const leader: Profile = {
  id: 'leader-1',
  email: 'leader@example.com',
  name: 'Leader',
  role: 'leader',
  is_active: true,
}

const announcement: Announcement = {
  id: 'announcement-1',
  title: 'Existing',
  body: 'Existing body',
  is_pinned: false,
  pinned_at: null,
  created_by: leader.id,
  created_at: '2026-07-16T00:00:00.000Z',
  updated_at: '2026-07-16T00:00:00.000Z',
}

function createContext(profile: Profile = leader, announcements: Announcement[] = [announcement]) {
  let current: AppData = {
    announcements,
    profiles: [leader],
    allowedUsers: [],
    products: [],
    dutyMajorCategories: [],
    duties: [],
    productAssignments: [],
    dutyAssignments: [],
    reviewRequests: [],
    projects: [],
    projectAssignments: [],
    profileNotes: [],
    activityLogs: [],
  }
  const ctx: RepositoryContext = {
    isRemote: false,
    profile,
    data: current,
    setData(updater) {
      current = typeof updater === 'function' ? updater(current) : updater
      ctx.data = current
    },
  }
  return { ctx, data: () => current }
}

describe('announcement mutations (local parity)', () => {
  it('creates a normalized pinned announcement and keeps pinned rows first', async () => {
    const olderPinned: Announcement = {
      ...announcement,
      id: 'announcement-pinned-old',
      is_pinned: true,
      pinned_at: '2026-07-15T00:00:00.000Z',
    }
    const { ctx, data } = createContext(leader, [announcement, olderPinned])

    await saveAnnouncement(ctx, {
      editingAnnouncementId: null,
      expectedUpdatedAt: null,
      payload: { title: '  New notice  ', body: '  Details  ', is_pinned: true },
    })

    expect(data().announcements[0]).toMatchObject({
      title: 'New notice',
      body: 'Details',
      is_pinned: true,
      created_by: leader.id,
    })
    expect(data().announcements[0]?.pinned_at).toBeTruthy()
    expect(data().announcements[data().announcements.length - 1]?.id).toBe(announcement.id)
  })

  it('updates, pins, and deletes an existing announcement', async () => {
    const { ctx, data } = createContext()

    await saveAnnouncement(ctx, {
      editingAnnouncementId: announcement.id,
      expectedUpdatedAt: announcement.updated_at,
      payload: { title: ' Updated ', body: ' Updated body ', is_pinned: false },
    })
    const updated = data().announcements[0]!
    expect(updated.title).toBe('Updated')
    expect(updated.updated_at).not.toBe(announcement.updated_at)

    await toggleAnnouncementPin(ctx, updated)
    const pinned = data().announcements[0]!
    expect(pinned.is_pinned).toBe(true)
    expect(pinned.pinned_at).toBeTruthy()

    await deleteAnnouncement(ctx, pinned)
    expect(data().announcements).toEqual([])
  })

  it.each([
    { ...leader, role: 'member' as const },
    { ...leader, is_active: false },
    { ...leader, must_change_password: true },
  ])('requires a current active leader', async (profile) => {
    const { ctx, data } = createContext(profile)

    await expect(saveAnnouncement(ctx, {
      editingAnnouncementId: null,
      expectedUpdatedAt: null,
      payload: { title: 'Blocked', body: 'Blocked', is_pinned: false },
    })).rejects.toBeInstanceOf(UserFacingError)
    expect(data().announcements).toEqual([announcement])
  })

  it('rejects stale pin and delete snapshots', async () => {
    const current = { ...announcement, updated_at: '2026-07-16T01:00:00.000Z' }
    const stale = { ...announcement, updated_at: '2026-07-16T00:30:00.000Z' }
    const { ctx, data } = createContext(leader, [current])

    await expect(saveAnnouncement(ctx, {
      editingAnnouncementId: current.id,
      expectedUpdatedAt: stale.updated_at,
      payload: { title: 'Stale edit', body: 'Stale edit', is_pinned: false },
    })).rejects.toThrow(STALE_WRITE_MESSAGE)
    await expect(toggleAnnouncementPin(ctx, stale)).rejects.toThrow(STALE_WRITE_MESSAGE)
    await expect(deleteAnnouncement(ctx, stale)).rejects.toThrow(STALE_WRITE_MESSAGE)
    expect(data().announcements).toEqual([current])
  })

  it('rejects blank and oversized payloads before mutating', async () => {
    const { ctx, data } = createContext()

    await expect(saveAnnouncement(ctx, {
      editingAnnouncementId: null,
      expectedUpdatedAt: null,
      payload: { title: ' ', body: 'Body', is_pinned: false },
    })).rejects.toBeInstanceOf(UserFacingError)
    await expect(saveAnnouncement(ctx, {
      editingAnnouncementId: null,
      expectedUpdatedAt: null,
      payload: { title: 'x'.repeat(201), body: 'Body', is_pinned: false },
    })).rejects.toBeInstanceOf(UserFacingError)
    expect(data().announcements).toEqual([announcement])
  })
})
