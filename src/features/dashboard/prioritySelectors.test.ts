import { describe, expect, it } from 'vitest'
import type { AppData, Profile } from '../../types'
import { selectLeaderPriorityQueue, selectProjectReminderItems } from './prioritySelectors'

const now = new Date('2026-07-06T12:00:00')

function member(id: string, name: string): Profile {
  return { id, email: `${id}@example.test`, name, role: 'member' }
}

function emptyData(): AppData {
  return {
    announcements: [],
    profiles: [],
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
}

describe('selectLeaderPriorityQueue', () => {
  it('ranks overdue reviews before project reminders and assignment gaps', () => {
    const data = emptyData()
    data.products = [{ id: 'p1', name: '제품A', category: '자사', company_name: '자사', sort_order: null }]
    data.reviewRequests = [
      {
        id: 'r1',
        requester_id: 'm1',
        title: '지연 검토',
        description: '',
        attachment_url: null,
        due_date: '2026-07-01',
        status: 'pending',
        created_at: '2026-06-30T00:00:00.000Z',
        updated_at: '2026-06-30T00:00:00.000Z',
      },
    ]
    data.projects = [
      {
        id: 'pj1',
        name: '마감 임박 프로젝트',
        description: '',
        deadline: '2026-07-08',
        status: 'in_progress',
        created_by: 'leader-1',
        created_at: '2026-06-01T00:00:00.000Z',
      },
    ]

    const queue = selectLeaderPriorityQueue(data, [member('m1', '파트원1')], now)

    expect(queue.map((item) => item.id)).toEqual(['review-r1', 'project-pj1', 'unassigned-products', 'assignment-gaps'])
    expect(queue[0].group).toBe('overdue')
    expect(queue[0].urgency).toBe('urgent')
  })

  it('puts 8-14 day project deadlines in the later group, not this week', () => {
    const data = emptyData()
    data.projects = [
      {
        id: 'pj-far',
        name: '2주 뒤 마감',
        description: '',
        deadline: '2026-07-16',
        status: 'in_progress',
        created_by: 'leader-1',
        created_at: '2026-06-01T00:00:00.000Z',
      },
    ]

    const queue = selectLeaderPriorityQueue(data, [], now)
    const project = queue.find((item) => item.id === 'pj-far' || item.id === 'project-pj-far')

    expect(project?.group).toBe('later')
    expect(project?.urgency).toBe('normal')
  })

  it('omits assignment-gap items when nothing is unassigned', () => {
    const data = emptyData()
    const queue = selectLeaderPriorityQueue(data, [], now)
    expect(queue).toEqual([])
  })
})

describe('selectProjectReminderItems', () => {
  it('counts per project (not per assignment) and keeps unassigned projects', () => {
    const data = emptyData()
    data.profiles = [member('m1', '파트원1'), member('m2', '파트원2')]
    data.projects = [
      {
        id: 'pj1',
        name: '두 명 배정',
        description: '',
        deadline: '2026-07-08',
        status: 'in_progress',
        created_by: 'leader-1',
        created_at: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'pj2',
        name: '무배정',
        description: '',
        deadline: '2026-07-09',
        status: 'planned',
        created_by: 'leader-1',
        created_at: '2026-06-01T00:00:00.000Z',
      },
    ]
    data.projectAssignments = [
      { id: 'pa1', project_id: 'pj1', user_id: 'm1', notes: null },
      { id: 'pa2', project_id: 'pj1', user_id: 'm2', notes: null },
    ]

    const items = selectProjectReminderItems(data, now)

    expect(items).toHaveLength(2)
    expect(items[0].project.id).toBe('pj1')
    expect(items[0].assigneeNames).toEqual(['파트원1', '파트원2'])
    expect(items[1].project.id).toBe('pj2')
    expect(items[1].assigneeNames).toEqual([])
  })
})
