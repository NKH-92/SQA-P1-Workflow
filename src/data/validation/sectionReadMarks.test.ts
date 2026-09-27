import { describe, expect, it } from 'vitest'
import {
  isReadMarkSection,
  parseSectionReadMarks,
  READ_MARK_KEY_LIMIT,
  readMarkKeysForServer,
  upsertSectionReadMark,
} from './sectionReadMarks'

const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`

describe('section read marks', () => {
  it('knows the three sections that keep read marks', () => {
    expect(['announcements', 'projects', 'change-applications'].every(isReadMarkSection)).toBe(true)
    expect(isReadMarkSection('reviews')).toBe(false)
    expect(isReadMarkSection(null)).toBe(false)
  })

  it('parses the RPC rows and rejects anything malformed', () => {
    const row = { user_id: 'u1', section: 'projects', seen_keys: [uuid(1)], seen_at: '2026-09-27T00:00:00Z' }
    expect(parseSectionReadMarks([row])).toEqual([row])
    expect(parseSectionReadMarks([])).toEqual([])
    expect(parseSectionReadMarks(null)).toBeNull()
    expect(parseSectionReadMarks({ rows: [] })).toBeNull()
    expect(parseSectionReadMarks([{ ...row, section: 'reviews' }])).toBeNull()
    expect(parseSectionReadMarks([{ ...row, seen_keys: [1] }])).toBeNull()
    expect(parseSectionReadMarks([{ ...row, seen_at: null }])).toBeNull()
  })

  it('sends unique uuid keys only, up to the server limit', () => {
    expect(readMarkKeysForServer([uuid(1), 'announcement-01', uuid(1), uuid(2)])).toEqual([uuid(1), uuid(2)])
    const many = Array.from({ length: READ_MARK_KEY_LIMIT + 20 }, (_, index) => uuid(index))
    expect(readMarkKeysForServer(many)).toHaveLength(READ_MARK_KEY_LIMIT)
  })

  it('replaces only the same person and section', () => {
    const base = [
      { user_id: 'u1', section: 'projects' as const, seen_keys: ['a'], seen_at: 't1' },
      { user_id: 'u1', section: 'announcements' as const, seen_keys: ['b'], seen_at: 't1' },
      { user_id: 'u2', section: 'projects' as const, seen_keys: ['c'], seen_at: 't1' },
    ]
    const next = upsertSectionReadMark(base, { user_id: 'u1', section: 'projects', seen_keys: ['a', 'd'], seen_at: 't2' })
    expect(next).toHaveLength(3)
    expect(next.find((mark) => mark.user_id === 'u1' && mark.section === 'projects')?.seen_keys).toEqual(['a', 'd'])
    expect(next.find((mark) => mark.user_id === 'u2')?.seen_keys).toEqual(['c'])
  })
})
