import { describe, expect, it } from 'vitest'
import { emptyData } from '../../app/constants'
import type { AppData, ChangeActionItem, ProductChangeTask, Profile } from '../../types'
import { buildChangeApplication, buildProductChangeTask } from '../../test/builders'
import { createPreviewData, previewLeader } from '../../demoData'
import {
  calculateChangeProgress,
  canEditChangeApplication,
  canProcessOwnChangeTask,
  canReopenOwnChangeTask,
  selectAssignableChangeAssignees,
  selectChangeApplicationSummaries,
  selectChangeApplicationSummary,
  selectChangeScopeProducts,
  selectMyProductChangeTaskContexts,
  selectProductChangeTaskContexts,
} from './selectors'

const member: Profile = { id: 'member-1', email: 'member@example.test', name: '담당자', role: 'member' }
const application = buildChangeApplication()
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
  return buildProductChangeTask({
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
  })
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
      allApplied: false,
      allProcessed: false,
    })
  })

  it('distinguishes every-product applied from processed with exceptions', () => {
    const applied = selectProductChangeTaskContexts(dataWithTasks([
      task('first', 'completed'),
      task('second', 'completed'),
    ]))
    const withException = selectProductChangeTaskContexts(dataWithTasks([
      task('first', 'completed'),
      task('second', 'not_applicable'),
    ]))

    expect(calculateChangeProgress(applied)).toMatchObject({
      allApplied: true,
      allProcessed: true,
      percent: 100,
    })
    expect(calculateChangeProgress(withException)).toMatchObject({
      allApplied: false,
      allProcessed: true,
      percent: 100,
    })
  })

  it('scopes the member work queue to published tasks assigned to that member', () => {
    const other = task('other', 'pending', 'member-2')
    const own = task('own', 'pending')
    const data = dataWithTasks([other, own])

    expect(selectMyProductChangeTaskContexts(data, member).map(({ task: item }) => item.id)).toEqual(['own'])

    const archivedData = {
      ...data,
      changeApplications: [{ ...application, archived_at: '2026-07-17T00:00:00.000Z' }],
    }
    expect(selectMyProductChangeTaskContexts(archivedData, member)).toEqual([])
  })

  it('treats an inactive assignee as unassigned even when a cached summary says final review is ready', () => {
    const data = dataWithTasks([task('completed', 'completed')])
    data.profiles = [{ ...member, is_active: false }]
    data.changeApplicationSummaries = [{
      change_application_id: application.id,
      workflow_status: 'final_review_ready',
      total_count: 1,
      pending_count: 0,
      completed_count: 1,
      not_applicable_count: 0,
      scope_removed_count: 0,
      unresolved_cancelled_count: 0,
      unassigned_count: 0,
      processed_count: 1,
      percent: 100,
      can_finalize: true,
    }]

    expect(selectChangeApplicationSummary(data, application.id)).toMatchObject({
      workflow_status: 'in_progress',
      unassigned_count: 1,
      can_finalize: false,
    })
  })

  it('locks content editing after a completed, not-applicable, or cancelled task', () => {
    const editable = selectProductChangeTaskContexts(dataWithTasks([task('pending', 'pending')]))
    const completed = selectProductChangeTaskContexts(dataWithTasks([task('completed', 'completed')]))
    const notApplicable = selectProductChangeTaskContexts(dataWithTasks([task('na', 'not_applicable')]))
    const cancelled = selectProductChangeTaskContexts(dataWithTasks([task('cancelled', 'cancelled')]))
    const leader = { ...member, id: application.created_by, role: 'leader' as const }

    expect(canEditChangeApplication(application, editable, member)).toBe(false)
    expect(canEditChangeApplication(application, editable, leader)).toBe(true)
    expect(canEditChangeApplication(application, completed, leader)).toBe(false)
    expect(canEditChangeApplication(application, notApplicable, leader)).toBe(false)
    expect(canEditChangeApplication(application, cancelled, leader)).toBe(false)
    expect(canEditChangeApplication({ ...application, archived_at: '2026-07-17T00:00:00.000Z' }, editable, leader)).toBe(false)
  })
})

describe('selectChangeApplicationSummaries', () => {
  it('matches the per-application summary for every application', () => {
    const data = createPreviewData()
    const [first] = data.changeApplications
    const second = buildChangeApplication({ id: 'change-second', change_number: 'CC-2026-201' })
    const third = buildChangeApplication({ id: 'change-third', change_number: 'CC-2026-202' })
    const empty = buildChangeApplication({ id: 'change-empty', change_number: 'CC-2026-203', status: 'draft' })
    data.changeApplications = [...data.changeApplications, second, third, empty]
    const inactiveMember: Profile = { id: 'member-inactive', email: 'inactive@example.test', name: '퇴사자', role: 'member', is_active: false }
    const secondAction: ChangeActionItem = { ...actionItem, id: 'action-second', change_application_id: second.id }
    const thirdAction: ChangeActionItem = { ...actionItem, id: 'action-third', change_application_id: third.id }
    data.profiles = [...data.profiles, inactiveMember]
    data.changeAssigneeOptions = [...data.changeAssigneeOptions, { id: 'option-only', name: '목록에만 있음', role: 'member' }]
    data.changeActionItems = [...data.changeActionItems, secondAction, thirdAction]
    data.productChangeTasks = [
      ...data.productChangeTasks,
      // 비활성 담당자: 서버 요약을 무시하고 담당자 없음으로 계산한다.
      { ...task('inactive', 'completed', inactiveMember.id), action_item_id: secondAction.id },
      // 프로필이 없으면 담당자 후보 목록으로 활성 여부를 본다.
      { ...task('option-only', 'completed', 'option-only'), action_item_id: thirdAction.id },
      { ...task('unknown', 'pending', 'unknown-person'), action_item_id: thirdAction.id },
      // 신청서를 찾을 수 없는 업무는 어디에도 들어가지 않는다.
      { ...task('orphan', 'pending'), action_item_id: 'missing-action' },
    ]
    const serverSummary = (id: string) => ({
      change_application_id: id,
      workflow_status: 'final_review_ready' as const,
      total_count: 1,
      pending_count: 0,
      completed_count: 1,
      not_applicable_count: 0,
      scope_removed_count: 0,
      unresolved_cancelled_count: 0,
      unassigned_count: 0,
      processed_count: 1,
      percent: 100,
      can_finalize: true,
    })
    data.changeApplicationSummaries = [serverSummary(first.id), serverSummary(second.id)]

    const summaries = selectChangeApplicationSummaries(data)

    expect([...summaries.keys()]).toEqual(data.changeApplications.map((item) => item.id))
    for (const item of data.changeApplications) {
      expect(summaries.get(item.id)).toEqual(selectChangeApplicationSummary(data, item.id))
    }
    expect(summaries.get(second.id)?.workflow_status).not.toBe('final_review_ready')
  })
})

describe('change task permissions', () => {
  it('lets the assigned person process and reopen their own task regardless of leader role, never a team leader', () => {
    const leader: Profile = { ...member, id: 'leader-1', role: 'leader' }
    const teamLeader: Profile = { ...member, id: 'team-leader-1', role: 'team_leader' }

    expect(canProcessOwnChangeTask(member, task('own', 'pending'), 'in_progress')).toBe(true)
    expect(canProcessOwnChangeTask(leader, task('leader-own', 'pending', leader.id), 'in_progress')).toBe(true)
    expect(canProcessOwnChangeTask(teamLeader, task('tl-own', 'pending', teamLeader.id), 'in_progress')).toBe(false)
    expect(canProcessOwnChangeTask(leader, task('other', 'pending'), 'in_progress')).toBe(false)
    expect(canProcessOwnChangeTask(member, task('own', 'pending'), 'final_review_ready')).toBe(false)
    expect(canProcessOwnChangeTask(member, task('done', 'completed'), 'in_progress')).toBe(false)

    expect(canReopenOwnChangeTask(member, task('done', 'completed'), 'final_review_ready')).toBe(true)
    expect(canReopenOwnChangeTask(leader, task('leader-na', 'not_applicable', leader.id), 'in_progress')).toBe(true)
    expect(canReopenOwnChangeTask(teamLeader, task('tl-done', 'completed', teamLeader.id), 'in_progress')).toBe(false)
    expect(canReopenOwnChangeTask(member, task('done', 'completed'), 'completed')).toBe(false)
    expect(canReopenOwnChangeTask(member, task('pending', 'pending'), 'in_progress')).toBe(false)
  })

  it('offers only active people who can process tasks as assignees', () => {
    const data: AppData = {
      ...emptyData,
      profiles: [previewLeader, member, { ...member, id: 'member-2', is_active: false }],
      changeAssigneeOptions: [
        { id: previewLeader.id, name: previewLeader.name, role: 'leader' },
        { id: member.id, name: member.name, role: 'member' },
        { id: 'member-2', name: '비활성', role: 'member' },
        { id: 'team-leader-1', name: '팀장', role: 'team_leader' },
      ],
    }

    expect(selectAssignableChangeAssignees(data).map((item) => item.id)).toEqual([previewLeader.id, member.id])
  })
})
