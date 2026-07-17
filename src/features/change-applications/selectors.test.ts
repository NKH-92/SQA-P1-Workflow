import { describe, expect, it } from 'vitest'
import { emptyData } from '../../app/constants'
import type { AppData, ChangeActionItem, ChangeApplication, ProductChangeTask, Profile } from '../../types'
import {
  calculateChangeProgress,
  canEditChangeApplication,
  selectChangeScopeProducts,
  selectMyProductChangeTaskContexts,
  selectProductChangeTaskContexts,
} from './selectors'

const member: Profile = { id: 'member-1', email: 'member@example.test', name: '담당자', role: 'member' }
const application: ChangeApplication = {
  id: 'change-1',
  change_number: 'CC-2026-001',
  source: 'official',
  title: '제조원 변경',
  summary: '요약',
  source_url: null,
  effective_date: '2026-08-01',
  status: 'published',
  created_by: 'leader-1',
  published_at: '2026-07-01T00:00:00.000Z',
  cancelled_at: null,
  cancellation_reason: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
}
const actionItem: ChangeActionItem = {
  id: 'action-1',
  change_application_id: application.id,
  kind: 'product_standard',
  custom_kind_name: null,
  content: '표준서 반영',
  due_date: '2026-07-10',
  sort_order: 1,
  created_at: application.created_at,
  updated_at: application.updated_at,
}

function task(id: string, status: ProductChangeTask['status'], assigneeId: string | null = member.id): ProductChangeTask {
  const processed = status === 'completed' || status === 'not_applicable'
  return {
    id,
    action_item_id: actionItem.id,
    product_id: `product-${id}`,
    product_name: `제품 ${id}`,
    assignee_id: assigneeId,
    assignee_name: assigneeId ? member.name : null,
    status,
    product_note: null,
    completion_note: status === 'completed' ? 'Rev.2' : null,
    resolution_reason: status === 'not_applicable' ? '미사용' : null,
    proxy_reason: null,
    completed_by: processed ? member.id : null,
    completed_by_name: processed ? member.name : null,
    completed_at: processed ? '2026-07-05T00:00:00.000Z' : null,
    reopened_by: null,
    reopened_by_name: null,
    reopened_at: null,
    reopen_reason: null,
    created_at: application.created_at,
    updated_at: application.updated_at,
  }
}

function dataWithTasks(tasks: ProductChangeTask[]): AppData {
  return {
    ...emptyData,
    profiles: [member],
    changeApplications: [application],
    changeActionItems: [actionItem],
    productChangeTasks: tasks,
  }
}

describe('change application selectors', () => {
  it('collapses product-scope rows while preserving multiple current assignees', () => {
    const data: AppData = {
      ...emptyData,
      changeProductScope: [
        { product_id: 'p1', product_name: 'A정', category: '자사', company_name: '자사', sort_order: 1, assignee_id: 'm1', assignee_name: '김담당' },
        { product_id: 'p1', product_name: 'A정', category: '자사', company_name: '자사', sort_order: 1, assignee_id: 'm2', assignee_name: '이담당' },
        { product_id: 'p2', product_name: 'B정', category: '위탁', company_name: '위탁사', sort_order: 2, assignee_id: null, assignee_name: null },
      ],
    }

    const products = selectChangeScopeProducts(data)

    expect(products).toHaveLength(2)
    expect(products[0].assignees.map((item) => item.name)).toEqual(['김담당', '이담당'])
    expect(products[1].assignees).toEqual([])
  })

  it('counts completed and not-applicable as processed while excluding cancelled scope', () => {
    const contexts = selectProductChangeTaskContexts(dataWithTasks([
      task('pending', 'pending'),
      task('completed', 'completed'),
      task('na', 'not_applicable'),
      task('cancelled', 'cancelled'),
      task('unassigned', 'pending', null),
    ]))

    expect(calculateChangeProgress(contexts)).toMatchObject({
      total: 4,
      processed: 2,
      completed: 1,
      notApplicable: 1,
      pending: 2,
      unassigned: 1,
      percent: 50,
    })
  })

  it('scopes the member work queue to published tasks assigned to that member', () => {
    const other = task('other', 'pending', 'member-2')
    const own = task('own', 'pending')
    const data = dataWithTasks([other, own])

    expect(selectMyProductChangeTaskContexts(data, member).map(({ task: item }) => item.id)).toEqual(['own'])
  })

  it('locks content editing after a completed, not-applicable, or cancelled task', () => {
    const editable = selectProductChangeTaskContexts(dataWithTasks([task('pending', 'pending')]))
    const completed = selectProductChangeTaskContexts(dataWithTasks([task('completed', 'completed')]))
    const notApplicable = selectProductChangeTaskContexts(dataWithTasks([task('na', 'not_applicable')]))
    const cancelled = selectProductChangeTaskContexts(dataWithTasks([task('cancelled', 'cancelled')]))
    const owner = { ...member, id: application.created_by }

    expect(canEditChangeApplication(application, editable, owner)).toBe(true)
    expect(canEditChangeApplication(application, completed, owner)).toBe(false)
    expect(canEditChangeApplication(application, notApplicable, owner)).toBe(false)
    expect(canEditChangeApplication(application, cancelled, owner)).toBe(false)
  })
})
