import { describe, expect, it } from 'vitest'
import type { Announcement } from '../types'
import { mergeAnnouncements, sortAnnouncements } from './announcementCollection'

function announcement(overrides: Partial<Announcement> & Pick<Announcement, 'id'>): Announcement {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    body: overrides.body ?? `${overrides.id} body`,
    is_pinned: overrides.is_pinned ?? false,
    pinned_at: overrides.pinned_at ?? null,
    created_by: overrides.created_by ?? 'leader-1',
    created_at: overrides.created_at ?? '2026-07-01T00:00:00.000Z',
    updated_at: overrides.updated_at ?? overrides.created_at ?? '2026-07-01T00:00:00.000Z',
  }
}

describe('announcementCollection', () => {
  it('sorts pinned announcements first with pinned_at, created_at, and id tie breakers', () => {
    const items = [
      announcement({
        id: 'regular-older',
        created_at: '2026-07-03T00:00:00.000Z',
      }),
      announcement({
        id: 'pinned-older',
        is_pinned: true,
        pinned_at: '2026-07-04T00:00:00.000Z',
        created_at: '2026-07-10T00:00:00.000Z',
      }),
      announcement({
        id: 'regular-newer',
        created_at: '2026-07-05T00:00:00.000Z',
      }),
      announcement({
        id: 'pinned-newer-z',
        is_pinned: true,
        pinned_at: '2026-07-06T00:00:00.000Z',
        created_at: '2026-07-02T00:00:00.000Z',
      }),
      announcement({
        id: 'pinned-newer-a',
        is_pinned: true,
        pinned_at: '2026-07-06T00:00:00.000Z',
        created_at: '2026-07-01T00:00:00.000Z',
      }),
      announcement({
        id: 'pinned-created-z',
        is_pinned: true,
        pinned_at: null,
        created_at: '2026-07-07T00:00:00.000Z',
      }),
      announcement({
        id: 'regular-tie-a',
        created_at: '2026-07-04T00:00:00.000Z',
      }),
      announcement({
        id: 'regular-tie-z',
        created_at: '2026-07-04T00:00:00.000Z',
      }),
    ]

    expect(sortAnnouncements(items).map(({ id }) => id)).toEqual([
      'pinned-created-z',
      'pinned-newer-z',
      'pinned-newer-a',
      'pinned-older',
      'regular-newer',
      'regular-tie-z',
      'regular-tie-a',
      'regular-older',
    ])
    expect(items.map(({ id }) => id)).toEqual([
      'regular-older',
      'pinned-older',
      'regular-newer',
      'pinned-newer-z',
      'pinned-newer-a',
      'pinned-created-z',
      'regular-tie-a',
      'regular-tie-z',
    ])
  })

  it('replaces matching IDs without duplicates and returns sorted output', () => {
    const current = [
      announcement({
        id: 'shared',
        title: 'stale shared',
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-02T00:00:00.000Z',
      }),
      announcement({
        id: 'regular',
        created_at: '2026-07-04T00:00:00.000Z',
      }),
    ]
    const incoming = [
      announcement({
        id: 'shared',
        title: 'fresh shared',
        is_pinned: true,
        pinned_at: '2026-07-06T00:00:00.000Z',
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-07T00:00:00.000Z',
      }),
      announcement({
        id: 'regular',
        title: 'older duplicate',
        created_at: '2026-07-04T00:00:00.000Z',
        updated_at: '2026-07-01T00:00:00.000Z',
      }),
      announcement({
        id: 'new-regular',
        created_at: '2026-07-05T00:00:00.000Z',
      }),
    ]

    const merged = mergeAnnouncements(current, incoming)

    expect(merged.map(({ id }) => id)).toEqual(['shared', 'new-regular', 'regular'])
    expect(merged).toHaveLength(3)
    expect(merged.find(({ id }) => id === 'shared')?.title).toBe('fresh shared')
    expect(merged.find(({ id }) => id === 'regular')?.title).toBe('regular')
  })

  it('uses descending id immediately when pinned effective timestamps are equal', () => {
    const items = [
      announcement({
        id: 'pinned-tie-a',
        is_pinned: true,
        pinned_at: '2026-07-08T00:00:00.000Z',
        created_at: '2026-07-07T00:00:00.000Z',
      }),
      announcement({
        id: 'pinned-tie-z',
        is_pinned: true,
        pinned_at: '2026-07-08T00:00:00.000Z',
        created_at: '2026-07-01T00:00:00.000Z',
      }),
      announcement({
        id: 'updated-tie-a',
        is_pinned: true,
        pinned_at: null,
        updated_at: '2026-07-09T00:00:00.000Z',
        created_at: '2026-07-08T00:00:00.000Z',
      }),
      announcement({
        id: 'updated-tie-z',
        is_pinned: true,
        pinned_at: null,
        updated_at: '2026-07-09T00:00:00.000Z',
        created_at: '2026-07-01T00:00:00.000Z',
      }),
    ]

    expect(sortAnnouncements(items).map(({ id }) => id)).toEqual([
      'updated-tie-z',
      'updated-tie-a',
      'pinned-tie-z',
      'pinned-tie-a',
    ])
  })

  it('accepts nullish inputs', () => {
    const single = announcement({ id: 'single' })

    expect(mergeAnnouncements(null, undefined)).toEqual([])
    expect(mergeAnnouncements(undefined, [single])).toEqual([single])
    expect(mergeAnnouncements([single], null)).toEqual([single])
  })
})
