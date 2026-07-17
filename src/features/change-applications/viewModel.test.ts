import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductChangeTaskContext } from './selectors'
import {
  calculateChangeApplicationKpis,
  filterChangeApplications,
  filterChangeTaskContexts,
  groupChangeTaskContexts,
  mergeProductChangeTasks,
} from './viewModel'

function context({
  id,
  productName,
  assigneeId = 'member-1',
  assigneeName = '파트원',
  status = 'pending',
  applicationStatus = 'published',
  creatorId = 'creator-1',
  dueDate = '2026-07-20',
}: {
  id: string
  productName: string
  assigneeId?: string | null
  assigneeName?: string | null
  status?: ProductChangeTaskContext['task']['status']
  applicationStatus?: ProductChangeTaskContext['application']['status']
  creatorId?: string
  dueDate?: string
}): ProductChangeTaskContext {
  return {
    application: {
      id: `application-${id}`,
      change_number: `CHG-${id}`,
      source: 'official',
      title: `${productName} 변경`,
      summary: '요약',
      source_url: null,
      effective_date: '2026-07-17',
      status: applicationStatus,
      content_locked_at: null,
      created_by: creatorId,
      published_at: applicationStatus === 'draft' ? null : '2026-07-17T00:00:00.000Z',
      cancelled_at: applicationStatus === 'cancelled' ? '2026-07-17T00:00:00.000Z' : null,
      cancellation_reason: applicationStatus === 'cancelled' ? '취소' : null,
      created_at: '2026-07-17T00:00:00.000Z',
      updated_at: '2026-07-17T00:00:00.000Z',
    },
    actionItem: {
      id: `action-${id}`,
      change_application_id: `application-${id}`,
      kind: 'product_standard',
      custom_kind_name: null,
      content: `${productName} 적용`,
      due_date: dueDate,
      sort_order: 0,
      created_at: '2026-07-17T00:00:00.000Z',
      updated_at: '2026-07-17T00:00:00.000Z',
    },
    task: {
      id: `task-${id}`,
      action_item_id: `action-${id}`,
      product_id: `product-${id}`,
      product_name: productName,
      assignee_id: assigneeId,
      assignee_name: assigneeName,
      status,
      product_note: null,
      completion_note: null,
      resolution_reason: null,
      proxy_reason: null,
      completed_by: null,
      completed_by_name: null,
      completed_at: status === 'completed' ? '2026-07-17T00:00:00.000Z' : null,
      reopened_by: null,
      reopened_by_name: null,
      reopened_at: null,
      reopen_reason: null,
      created_at: '2026-07-17T00:00:00.000Z',
      updated_at: '2026-07-17T00:00:00.000Z',
      products: { name: productName, category: '제품', company_name: null, sort_order: 0 },
    },
  }
}

describe('change application view model', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-17T09:00:00+09:00'))
  })

  afterEach(() => vi.useRealTimers())

  it('merges cached task history without changing order and respects refresh precedence', () => {
    const first = context({ id: '1', productName: '가' }).task
    const second = context({ id: '2', productName: '나' }).task
    const refreshedFirst = { ...first, assignee_name: '새 담당자' }

    expect(mergeProductChangeTasks([first], [refreshedFirst, second], false)).toEqual([first, second])
    expect(mergeProductChangeTasks([first], [refreshedFirst, second], true)).toEqual([refreshedFirst, second])
  })

  it('keeps the existing inclusive D-3 attention boundary', () => {
    const today = context({ id: 'today', productName: '가', dueDate: '2026-07-17' })
    const dayThree = context({ id: 'three', productName: '나', dueDate: '2026-07-20' })
    const dayFour = context({ id: 'four', productName: '다', dueDate: '2026-07-21' })
    const overdue = context({ id: 'overdue', productName: '라', dueDate: '2026-07-16' })

    const result = filterChangeTaskContexts([today, dayThree, dayFour, overdue], {
      status: 'pending',
      application: 'published',
      actionKind: 'all',
      attention: 'due_soon',
      query: '',
    })

    expect(result.map(({ task }) => task.id)).toEqual(['task-today', 'task-three'])
  })

  it('hides another member draft while retaining a task-level search match', () => {
    const ownDraft = context({ id: 'own', productName: '가', applicationStatus: 'draft', creatorId: 'member-1' })
    const otherDraft = context({ id: 'other', productName: '나', applicationStatus: 'draft', creatorId: 'member-2' })
    const published = context({ id: 'published', productName: '특별제품' })
    const applications = [ownDraft.application, otherDraft.application, published.application]
    const filters = {
      status: 'all' as const,
      application: 'all' as const,
      actionKind: 'all' as const,
      attention: 'all' as const,
      query: '특별제품',
    }

    expect(filterChangeApplications(applications, [published], filters, false, 'member-1'))
      .toEqual([published.application])
  })

  it('keeps member KPI scope assignee-only and leader unassigned scope team-wide', () => {
    const mine = context({ id: 'mine', productName: '가', assigneeId: 'member-1' })
    const other = context({ id: 'other', productName: '나', assigneeId: 'member-2' })
    const unassigned = context({ id: 'none', productName: '다', assigneeId: null, assigneeName: null })

    const member = calculateChangeApplicationKpis([mine, other, unassigned], false, 'member-1')
    const leader = calculateChangeApplicationKpis([mine, other, unassigned], true, 'leader-1')

    expect(member.pendingContexts.map(({ task }) => task.id)).toEqual(['task-mine'])
    expect(member.unassignedCount).toBe(0)
    expect(leader.pendingContexts).toHaveLength(3)
    expect(leader.unassignedCount).toBe(1)
  })

  it('sorts groups by Korean title while preserving task order inside each group', () => {
    const firstB = context({ id: 'b1', productName: '나' })
    const firstA = context({ id: 'a1', productName: '가' })
    const secondB = { ...context({ id: 'b2', productName: '나' }), task: { ...context({ id: 'b2', productName: '나' }).task, product_id: firstB.task.product_id } }

    const groups = groupChangeTaskContexts([firstB, firstA, secondB], 'product')

    expect(groups.map((group) => group.title)).toEqual(['가', '나'])
    expect(groups[1].items.map(({ task }) => task.id)).toEqual(['task-b1', 'task-b2'])
  })
})
