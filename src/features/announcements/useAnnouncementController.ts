import { useMemo } from 'react'
import {
  createRepositoryContext,
  deleteAnnouncement,
  saveAnnouncement,
  toggleAnnouncementPin,
} from '../../data'
import type { AnnouncementPayload } from '../../data/contracts'
import type { AppData, Profile } from '../../types'
import type { AppDataUpdater } from '../../data/repositories/appDataUpdater'

export function useAnnouncementController(profile: Profile, data: AppData, setData: AppDataUpdater) {
  const context = useMemo(() => createRepositoryContext(profile, data, setData), [data, profile, setData])
  return {
    save: (editingAnnouncementId: string | null, expectedUpdatedAt: string | null, payload: AnnouncementPayload) =>
      saveAnnouncement(context, { editingAnnouncementId, expectedUpdatedAt, payload }),
    togglePin: (announcement: AppData['announcements'][number]) => toggleAnnouncementPin(context, announcement),
    remove: (announcement: AppData['announcements'][number]) => deleteAnnouncement(context, announcement),
  }
}
