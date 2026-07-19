import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserFacingError } from '../../lib/errors'
import type { Announcement, AppData, Profile } from '../../types'
import { createRepositoryContextFromDeps, type RepositoryContext } from '../repositoryContext'

const mocks = vi.hoisted(() => {
  const mutationSelect = vi.fn()
  const updateVersionEq = vi.fn(() => ({ select: mutationSelect }))
  const updateIdEq = vi.fn(() => ({ eq: updateVersionEq }))
  const update = vi.fn(() => ({ eq: updateIdEq }))
  const deleteVersionEq = vi.fn(() => ({ select: mutationSelect }))
  const deleteIdEq = vi.fn(() => ({ eq: deleteVersionEq }))
  const deleteRow = vi.fn(() => ({ eq: deleteIdEq }))
  const insertSingle = vi.fn()
  const insertSelect = vi.fn(() => ({ single: insertSingle }))
  const insert = vi.fn(() => ({ select: insertSelect }))
  const from = vi.fn(() => ({ update, delete: deleteRow, insert }))
  return {
    mutationSelect,
    updateVersionEq,
    updateIdEq,
    update,
    deleteVersionEq,
    deleteIdEq,
    deleteRow,
    insertSingle,
    insertSelect,
    insert,
    from,
  }
})

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { from: mocks.from },
}))

import { deleteAnnouncement, saveAnnouncement, toggleAnnouncementPin } from './announcements'

const leader: Profile = {
  id: 'leader-1',
  email: 'leader@example.com',
  name: 'Leader',
  role: 'leader',
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

function remoteContext(): RepositoryContext {
  const data: AppData = {
    announcements: [announcement],
    changeApplications: [],
    changeActionItems: [],
    productChangeTasks: [],
    changeProductScope: [],
    changeAssigneeOptions: [],
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
  return createRepositoryContextFromDeps('remote', {profile: leader, data, setData: vi.fn() })
}

describe('announcement mutation contracts (remote)', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockClear())
    mocks.mutationSelect.mockResolvedValue({ data: [{ id: announcement.id }], error: null })
    mocks.insertSingle.mockResolvedValue({ data: { id: 'announcement-new' }, error: null })
  })

  it('inserts only client-writable columns and lets the database own audit fields', async () => {
    await saveAnnouncement(remoteContext(), {
      editingAnnouncementId: null,
      expectedUpdatedAt: null,
      payload: { title: '  New  ', body: '  Body  ', is_pinned: true },
    })

    expect(mocks.from).toHaveBeenCalledWith('announcements')
    expect(mocks.insert).toHaveBeenCalledWith({
      title: 'New',
      body: 'Body',
      is_pinned: true,
    })
    expect(mocks.insertSelect).toHaveBeenCalledWith('id')
  })

  it('updates by id and updated_at without writing server-owned fields', async () => {
    const ctx = remoteContext()
    ctx.data.announcements[0] = {
      ...announcement,
      updated_at: '2026-07-16T01:00:00.000Z',
    }
    await saveAnnouncement(ctx, {
      editingAnnouncementId: announcement.id,
      expectedUpdatedAt: announcement.updated_at,
      payload: { title: 'Updated', body: 'Updated body', is_pinned: true },
    })

    expect(mocks.update).toHaveBeenCalledWith({
      title: 'Updated',
      body: 'Updated body',
      is_pinned: true,
    })
    expect(mocks.updateIdEq).toHaveBeenCalledWith('id', announcement.id)
    expect(mocks.updateVersionEq).toHaveBeenCalledWith('updated_at', announcement.updated_at)
  })

  it('uses the updated_at snapshot for pin and delete operations', async () => {
    const ctx = remoteContext()
    await toggleAnnouncementPin(ctx, announcement)

    expect(mocks.update).toHaveBeenCalledWith({ is_pinned: true })
    expect(mocks.updateVersionEq).toHaveBeenCalledWith('updated_at', announcement.updated_at)

    await deleteAnnouncement(ctx, announcement)
    expect(mocks.deleteIdEq).toHaveBeenCalledWith('id', announcement.id)
    expect(mocks.deleteVersionEq).toHaveBeenCalledWith('updated_at', announcement.updated_at)
  })

  it('surfaces zero affected rows as a stale-write conflict', async () => {
    mocks.mutationSelect.mockResolvedValueOnce({ data: [], error: null })

    await expect(toggleAnnouncementPin(remoteContext(), announcement)).rejects.toBeInstanceOf(UserFacingError)
  })
})
