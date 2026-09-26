import { describe, expect, it } from 'vitest'
import type { AppData, Profile } from '../../types'
import {
  matchesPriorityFilter,
  selectLeaderPriorityQueue,
  selectProjectReminderItems,
  selectUnassignedProductImpact,
} from './prioritySelectors'

const now = new Date('2026-07-06T12:00:00')

function member(id: string, name: string): Profile {
  return { id, email: `${id}@example.test`, name, role: 'member' }
}

function emptyData(): AppData {
  return {
    announcements: [],
    changeApplications: [],
    changeActionItems: [],
    productChangeTasks: [],
    changeProductScope: [],
    changeAssigneeOptions: [],
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

    expect(queue.map((item) => item.id)).toEqual(['review-r1', 'project-pj1', 'product-p1', 'member-m1'])
    expect(queue[0].group).toBe('overdue')
    expect(queue[0].urgency).toBe('urgent')
    expect(queue[0]).toMatchObject({ statusLabel: '5일 지남', action: '검토하기', targetTab: 'reviews', entityId: 'r1' })
    expect(queue[1]).toMatchObject({ group: 'week', statusLabel: 'D-2', action: '확인하기', entityId: 'pj1' })
    expect(queue[2]).toMatchObject({ category: 'product', statusLabel: '담당자 없음', action: '담당자 배정하기', targetTab: 'products' })
    expect(queue[3]).toMatchObject({ category: 'member', meta: '담당 제품과 정기 업무가 없어요', entityId: 'm1', targetTab: 'team' })
  })

  it('never uses D+n, 초과 or 지연 and asks to adjust the deadline of overdue projects', () => {
    const data = emptyData()
    data.projects = [
      {
        id: 'pj-late',
        name: '지난 프로젝트',
        description: '',
        deadline: '2026-07-01',
        status: 'in_progress',
        created_by: 'leader-1',
        created_at: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'pj-done',
        name: '끝난 프로젝트',
        description: '',
        deadline: '2026-07-01',
        status: 'done',
        created_by: 'leader-1',
        created_at: '2026-06-01T00:00:00.000Z',
      },
    ]

    const queue = selectLeaderPriorityQueue(data, [], now)

    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ id: 'project-pj-late', statusLabel: '5일 지남', action: '기한 조정', entityId: 'pj-late' })
    expect(queue.map((item) => item.statusLabel).join(' ')).not.toMatch(/D\+|초과|지연/)
    expect(matchesPriorityFilter(queue[0], 'overdue-project')).toBe(true)
    expect(matchesPriorityFilter(queue[0], 'review')).toBe(false)
  })

  it('groups pending change tasks per common change and flags missing owners', () => {
    const data = emptyData()
    data.products = [
      { id: 'p1', name: '자사제품 A', category: '자사', company_name: '자사', sort_order: null },
      { id: 'p2', name: '위탁제품 E', category: '위탁', company_name: '위탁사 B', sort_order: null },
    ]
    data.productAssignments = [{ id: 'pa1', user_id: 'm1', product_id: 'p1' }]
    data.changeApplications = [{
      id: 'cc1',
      change_number: 'CC-2026-014',
      source: 'official',
      title: '원료 제조원 변경',
      summary: '',
      source_url: null,
      effective_date: null,
      status: 'published',
      created_by: 'leader-1',
      published_at: '2026-06-01T00:00:00.000Z',
      cancelled_at: null,
      cancellation_reason: null,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }]
    data.changeActionItems = [{
      id: 'a1',
      change_application_id: 'cc1',
      kind: 'product_standard',
      custom_kind_name: null,
      content: '',
      due_date: '2026-08-30',
      sort_order: 1,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }]
    const task = {
      action_item_id: 'a1',
      status: 'pending' as const,
      product_note: null,
      completion_note: null,
      resolution_reason: null,
      proxy_reason: null,
      completed_by: null,
      completed_by_name: null,
      completed_at: null,
      reopened_by: null,
      reopened_by_name: null,
      reopened_at: null,
      reopen_reason: null,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    }
    data.productChangeTasks = [
      { ...task, id: 't1', product_id: 'p1', product_name: '자사제품 A', assignee_id: 'm1', assignee_name: '파트원1' },
      { ...task, id: 't2', product_id: 'p2', product_name: '위탁제품 E', assignee_id: null, assignee_name: null },
    ]

    const queue = selectLeaderPriorityQueue(data, [], now)
    const change = queue.find((item) => item.id === 'change-cc1')

    expect(change).toMatchObject({
      category: 'change',
      group: 'assign',
      meta: 'CC-2026-014 · 미적용 2건 · 담당자 없음 1건',
      action: '확인하기',
      entityId: 'cc1',
    })
    expect(queue.find((item) => item.id === 'product-p2')?.meta).toBe('적용 업무 1건이 멈춰 있어요')
    expect(selectUnassignedProductImpact(data)).toMatchObject({ blockedTaskCount: 1 })
    expect(selectUnassignedProductImpact(data).products.map((product) => product.id)).toEqual(['p2'])
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
