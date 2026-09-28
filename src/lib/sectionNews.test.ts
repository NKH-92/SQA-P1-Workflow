import { describe, expect, it } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../demoData'
import type { Profile, SectionReadMark } from '../types'
import {
  FIRST_VISIT_NEW_DAYS,
  READ_MARK_KEY_LIMIT,
  newestSectionTarget,
  receivesSectionNews,
  sectionNeedsReadMark,
  sectionNewsItems,
  sectionReadMark,
  unseenSectionItems,
  type SectionNewsItem,
} from './sectionNews'

const NOW = Date.parse('2026-09-27T03:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const teamLeader: Profile = { ...previewLeader, id: 'team-leader', role: 'team_leader' }

function item(key: string, daysAgo: number | null, target = key): SectionNewsItem {
  return { key, target, at: daysAgo == null ? null : new Date(NOW - daysAgo * DAY).toISOString() }
}

function mark(section: SectionReadMark['section'], seen: string[], userId = previewMember.id): SectionReadMark {
  return { user_id: userId, section, seen_keys: seen, seen_at: '2026-09-26T00:00:00.000Z' }
}

describe('section news', () => {
  it('gives news to members and the leader but not to read-only team leaders or inactive people', () => {
    expect(receivesSectionNews(previewMember)).toBe(true)
    expect(receivesSectionNews(previewLeader)).toBe(true)
    expect(receivesSectionNews(teamLeader)).toBe(false)
    expect(receivesSectionNews({ ...previewMember, is_active: false })).toBe(false)
    const data = createPreviewData()
    expect(sectionNewsItems(teamLeader, data, 'announcements')).toEqual([])
  })

  it('never treats my own announcements as news and opens the announcement itself', () => {
    const data = createPreviewData()
    expect(sectionNewsItems(previewLeader, data, 'announcements')).toEqual([])
    const items = sectionNewsItems(previewMember, data, 'announcements')
    expect(items.map((news) => news.key)).toEqual(['announcement-01', 'announcement-02'])
    expect(items.every((news) => news.target === news.key)).toBe(true)
  })

  it('tracks new project assignments for members only and opens the project', () => {
    const data = createPreviewData()
    expect(sectionNewsItems(previewLeader, data, 'projects')).toEqual([])
    const mine = data.projectAssignments.filter((assignment) => assignment.user_id === previewMember.id)
    expect(sectionNewsItems(previewMember, data, 'projects')).toEqual(
      mine.map((assignment) => ({ key: assignment.id, target: assignment.project_id, at: assignment.created_at })),
    )
  })

  it('tracks my pending change tasks, or the changes waiting for the leader, and opens the change', () => {
    const data = createPreviewData()
    const memberItems = sectionNewsItems(previewMember, data, 'change-applications')
    expect(memberItems.length).toBeGreaterThan(0)
    for (const news of memberItems) {
      const task = data.productChangeTasks.find((candidate) => candidate.id === news.key)!
      expect(task.assignee_id).toBe(previewMember.id)
      expect(task.status).toBe('pending')
      const action = data.changeActionItems.find((candidate) => candidate.id === task.action_item_id)!
      expect(news.target).toBe(action.change_application_id)
    }
    const leaderItems = sectionNewsItems(previewLeader, data, 'change-applications')
    expect(leaderItems.every((news) => news.key === news.target)).toBe(true)
  })

  it('compares what I can see now with what I saw on my last visit', () => {
    const items = [item('a', 30), item('b', 1), item('c', 0)]
    expect(unseenSectionItems(items, mark('announcements', ['a', 'b']), true, NOW).map((news) => news.key)).toEqual(['c'])
    expect(unseenSectionItems(items, mark('announcements', ['a', 'b', 'c']), true, NOW)).toEqual([])
  })

  it('only counts recent items as news before the first visit and nothing while the marks are unknown', () => {
    const items = [item('old', FIRST_VISIT_NEW_DAYS + 1), item('recent', FIRST_VISIT_NEW_DAYS - 1), item('undated', null)]
    expect(unseenSectionItems(items, undefined, true, NOW).map((news) => news.key)).toEqual(['recent'])
    expect(unseenSectionItems(items, undefined, false, NOW)).toEqual([])
  })

  it('writes a mark on the first visit or when something new appears', () => {
    const items = [item('a', 1), item('b', 0)]
    expect(sectionNeedsReadMark([], undefined)).toBe(true)
    expect(sectionNeedsReadMark(items, mark('projects', ['a']))).toBe(true)
    expect(sectionNeedsReadMark(items, mark('projects', ['a', 'b', 'gone']))).toBe(false)
  })

  it('opens the most recent new item', () => {
    expect(newestSectionTarget([item('a', 3, 'x'), item('b', 1, 'y'), item('c', null, 'z')])).toBe('y')
    expect(newestSectionTarget([])).toBeUndefined()
  })

  it('only judges as many items as the server can record, so opening the section clears the news', () => {
    const data = createPreviewData()
    const base = data.projectAssignments[0]
    const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
    // 501건 가운데 하나만 가장 오래됐고, 나머지는 같은 때라 key 순으로 자른다.
    const assignments = Array.from({ length: READ_MARK_KEY_LIMIT + 1 }, (_, index) => ({
      ...base,
      id: uuid(index),
      user_id: previewMember.id,
      created_at: index === 0 ? '2026-09-01T00:00:00.000Z' : '2026-09-20T00:00:00.000Z',
    }))
    const items = sectionNewsItems(previewMember, { ...data, projectAssignments: assignments }, 'projects')
    expect(items).toHaveLength(READ_MARK_KEY_LIMIT)
    expect(items.map((news) => news.key)).not.toContain(uuid(0))
    expect(items[0].key).toBe(uuid(1))
    expect(items[READ_MARK_KEY_LIMIT - 1].key).toBe(uuid(READ_MARK_KEY_LIMIT))

    // 화면을 열어 서버가 저장할 수 있는 만큼(판정 대상 전부) 기록하면 새 소식이 남지 않는다.
    const recorded = mark('projects', items.map((news) => news.key))
    expect(unseenSectionItems(items, recorded, true, NOW)).toEqual([])
    expect(sectionNeedsReadMark(items, recorded)).toBe(false)
  })

  it('reads only my own mark for a section', () => {
    const data = { sectionReadMarks: [mark('projects', ['other'], 'someone-else'), mark('projects', ['mine'])] }
    expect(sectionReadMark(data, previewMember, 'projects')?.seen_keys).toEqual(['mine'])
    expect(sectionReadMark(data, previewMember, 'announcements')).toBeUndefined()
  })
})
