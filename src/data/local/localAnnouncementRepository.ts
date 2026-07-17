import { assertRecordExists, STALE_WRITE_MESSAGE, UserFacingError } from '../../lib/errors'
import { makeId } from '../../lib/format'
import type { AnnouncementRepository, RepositoryDeps } from '../repositories/types'
import {
  createAnnouncement,
  removeAnnouncement,
  toggleAnnouncementPinned,
  updateAnnouncement,
} from './appDataReducers'

export function createLocalAnnouncementRepository(ctx: RepositoryDeps): AnnouncementRepository {
  const { profile, data, setData } = ctx

  const assertLeader = () => {
    if (profile.role !== 'leader' || profile.is_active === false || profile.must_change_password === true) {
      throw new UserFacingError('활성 파트장 권한이 필요합니다.')
    }
  }

  const assertCurrent = (announcement: { id: string; updated_at: string }) => {
    const current = data.announcements.find((item) => item.id === announcement.id)
    assertRecordExists(current)
    if (current.updated_at !== announcement.updated_at) {
      throw new UserFacingError(STALE_WRITE_MESSAGE)
    }
  }

  return {
    async saveAnnouncement({ editingAnnouncementId, expectedUpdatedAt, payload }) {
      assertLeader()
      if (editingAnnouncementId) {
        const current = data.announcements.find((item) => item.id === editingAnnouncementId)
        assertRecordExists(current)
        if (!expectedUpdatedAt || current.updated_at !== expectedUpdatedAt) {
          throw new UserFacingError(STALE_WRITE_MESSAGE)
        }
        setData((current) => updateAnnouncement(current, editingAnnouncementId, payload))
        return
      }
      setData((current) => createAnnouncement(current, profile, makeId('announcement'), payload))
    },

    async toggleAnnouncementPin(announcement) {
      assertLeader()
      assertCurrent(announcement)
      setData((current) => toggleAnnouncementPinned(current, announcement.id))
    },

    async deleteAnnouncement(announcement) {
      assertLeader()
      assertCurrent(announcement)
      setData((current) => removeAnnouncement(current, announcement.id))
    },
  }
}
