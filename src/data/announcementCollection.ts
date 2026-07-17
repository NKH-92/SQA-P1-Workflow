import type { Announcement } from '../types'

function freshness(announcement: Announcement): number {
  const updatedAt = Date.parse(announcement.updated_at)
  return Number.isFinite(updatedAt) ? updatedAt : Date.parse(announcement.created_at)
}

export function sortAnnouncements(items: Announcement[]): Announcement[] {
  return [...items].sort((left, right) => {
    if (left.is_pinned !== right.is_pinned) return left.is_pinned ? -1 : 1
    if (left.is_pinned && right.is_pinned) {
      const pinnedDifference =
        Date.parse(right.pinned_at ?? right.created_at) - Date.parse(left.pinned_at ?? left.created_at)
      if (pinnedDifference !== 0) return pinnedDifference
    }
    const createdDifference = Date.parse(right.created_at) - Date.parse(left.created_at)
    return createdDifference !== 0 ? createdDifference : right.id.localeCompare(left.id)
  })
}

export function mergeAnnouncements(
  current: Announcement[] | null | undefined,
  incoming: Announcement[] | null | undefined,
): Announcement[] {
  const byId = new Map<string, Announcement>()
  for (const announcement of current ?? []) byId.set(announcement.id, announcement)
  for (const announcement of incoming ?? []) {
    const previous = byId.get(announcement.id)
    if (!previous || freshness(announcement) >= freshness(previous)) {
      byId.set(announcement.id, announcement)
    }
  }
  return sortAnnouncements([...byId.values()])
}
