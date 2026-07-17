import { sortAnnouncements } from '../announcementCollection'
import type { AnnouncementPayload } from '../contracts'
import type { AppData, Profile } from '../../types'

function announcementTimestamp(previous?: string): string {
  const now = Date.now()
  const previousTime = previous ? Date.parse(previous) : Number.NaN
  return new Date(Number.isFinite(previousTime) && now <= previousTime ? previousTime + 1 : now).toISOString()
}

export function createAnnouncement(
  data: AppData,
  profile: Profile,
  announcementId: string,
  payload: AnnouncementPayload,
): AppData {
  const now = announcementTimestamp()
  const announcement = {
    id: announcementId,
    title: payload.title,
    body: payload.body,
    is_pinned: payload.is_pinned,
    pinned_at: payload.is_pinned ? now : null,
    created_by: profile.id,
    created_at: now,
    updated_at: now,
  }
  return { ...data, announcements: sortAnnouncements([announcement, ...data.announcements]) }
}

export function updateAnnouncement(
  data: AppData,
  announcementId: string,
  payload: AnnouncementPayload,
): AppData {
  return {
    ...data,
    announcements: sortAnnouncements(
      data.announcements.map((announcement) => {
        if (announcement.id !== announcementId) return announcement
        const nextPinnedAt = payload.is_pinned
          ? announcement.is_pinned
            ? announcement.pinned_at ?? announcementTimestamp(announcement.updated_at)
            : announcementTimestamp(announcement.updated_at)
          : null
        return {
          ...announcement,
          ...payload,
          pinned_at: nextPinnedAt,
          updated_at: announcementTimestamp(announcement.updated_at),
        }
      }),
    ),
  }
}

export function toggleAnnouncementPinned(data: AppData, announcementId: string): AppData {
  return {
    ...data,
    announcements: sortAnnouncements(
      data.announcements.map((announcement) => {
        if (announcement.id !== announcementId) return announcement
        const isPinned = !announcement.is_pinned
        const updatedAt = announcementTimestamp(announcement.updated_at)
        return {
          ...announcement,
          is_pinned: isPinned,
          pinned_at: isPinned ? updatedAt : null,
          updated_at: updatedAt,
        }
      }),
    ),
  }
}

export function removeAnnouncement(data: AppData, announcementId: string): AppData {
  return {
    ...data,
    announcements: data.announcements.filter((announcement) => announcement.id !== announcementId),
  }
}
