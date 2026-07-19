import type { Announcement } from '../types'

function freshness(announcement: Announcement): number {
  const updatedAt = Date.parse(announcement.updated_at)
  return Number.isFinite(updatedAt) ? updatedAt : Date.parse(announcement.created_at)
}

export function sortAnnouncements(items: Announcement[]): Announcement[] {
  return [...items].sort((left, right) => {
    if (left.is_pinned !== right.is_pinned) return left.is_pinned ? -1 : 1

    const leftTime = Date.parse(
      left.is_pinned ? left.pinned_at ?? left.updated_at ?? left.created_at : left.created_at,
    )
    const rightTime = Date.parse(
      right.is_pinned ? right.pinned_at ?? right.updated_at ?? right.created_at : right.created_at,
    )

    if (leftTime !== rightTime) return rightTime - leftTime
    return right.id.localeCompare(left.id)
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
