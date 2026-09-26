import { describe, expect, it } from 'vitest'
import { emptyData } from '../app/constants'
import type { AppData, Profile } from '../types'
import type { AppNotification } from '../lib/notifications'
import { buildShellModel, shellTabAccessibleName } from './shellModel'

const leader: Profile = { id: 'leader', email: 'leader@example.com', name: '파트장', role: 'leader', is_active: true }
const member: Profile = { id: 'member', email: 'member@example.com', name: '파트원', role: 'member', is_active: true }
const otherMember: Profile = { id: 'other', email: 'other@example.com', name: '다른 파트원', role: 'member', is_active: true }

const notifications = [
  { id: 'unread-1', unread: true },
  { id: 'read-1', unread: false },
  { id: 'unread-2', unread: true },
] as AppNotification[]

function modelData(): AppData {
  return {
    ...emptyData,
    profiles: [leader, member, otherMember],
    announcements: [{ id: 'notice-1' }, { id: 'notice-2' }] as AppData['announcements'],
    reviewRequests: [
      { id: 'review-1', requester_id: member.id },
      { id: 'review-2', requester_id: member.id },
      { id: 'review-3', requester_id: otherMember.id },
    ] as AppData['reviewRequests'],
    productChangeTasks: [
      { id: 'task-own', action_item_id: 'action-active', status: 'pending', assignee_id: member.id },
      { id: 'task-other', action_item_id: 'action-active', status: 'pending', assignee_id: otherMember.id },
      { id: 'task-done', action_item_id: 'action-final', status: 'completed', assignee_id: member.id },
    ] as AppData['productChangeTasks'],
    changeApplications: [
      { id: 'change-active', status: 'published' },
      { id: 'change-final', status: 'published' },
      { id: 'change-completed', status: 'published', final_completed_at: '2026-07-30T00:00:00Z' },
      { id: 'change-cancelled', status: 'cancelled' },
      { id: 'change-legacy', status: 'published', archived_at: '2026-07-29T00:00:00Z' },
    ] as AppData['changeApplications'],
    changeApplicationSummaries: [
      { change_application_id: 'change-active', workflow_status: 'in_progress' },
      { change_application_id: 'change-final', workflow_status: 'final_review_ready' },
      { change_application_id: 'change-completed', workflow_status: 'completed' },
      { change_application_id: 'change-cancelled', workflow_status: 'cancelled' },
      { change_application_id: 'change-legacy', workflow_status: 'legacy_completed' },
    ] as AppData['changeApplicationSummaries'],
    changeActionItems: [
      { id: 'action-active', change_application_id: 'change-active' },
      { id: 'action-final', change_application_id: 'change-final' },
    ] as AppData['changeActionItems'],
    projects: [{ id: 'project-1' }, { id: 'project-2' }, { id: 'project-3' }] as AppData['projects'],
    projectAssignments: [
      { id: 'pa-1', user_id: member.id },
      { id: 'pa-2', user_id: member.id },
      { id: 'pa-3', user_id: otherMember.id },
    ] as AppData['projectAssignments'],
    products: [{ id: 'product-1' }, { id: 'product-2' }] as AppData['products'],
    productAssignments: [
      { id: 'product-a-1', user_id: member.id, product_id: 'product-1' },
      { id: 'product-a-2', user_id: member.id, product_id: 'product-2' },
      { id: 'product-a-3', user_id: otherMember.id, product_id: 'product-1' },
    ] as AppData['productAssignments'],
    duties: [{ id: 'duty-1' }] as AppData['duties'],
    dutyAssignments: [
      { id: 'duty-a-1', user_id: member.id },
      { id: 'duty-a-2', user_id: otherMember.id },
    ] as AppData['dutyAssignments'],
    allowedUsers: [{ id: 'invite-1' }, { id: 'invite-2' }] as AppData['allowedUsers'],
    activityLogs: [{ id: 'log-1' }] as AppData['activityLogs'],
  }
}

describe('buildShellModel', () => {
  it('badges only what the leader must act on: pending reviews, change applications and missing owners', () => {
    const model = buildShellModel({
      data: modelData(),
      profile: leader,
      leaderMode: true,
      pendingCount: 7,
      unreadReviewsCount: 3,
      notifications,
    })

    expect(model.unreadNotifications).toBe(2)
    expect(model.tabs).toEqual({
      reviews: { count: 7, countLabel: '대기 7건', unreadCount: 3 },
      // 최종 확인을 기다리는 공통변경만 센다. 담당자가 모두 있는 진행 중 공통변경은 파트원의 일이다.
      'change-applications': { count: 1, countLabel: '확인할 공통변경 1건' },
    })
    // 공지·프로젝트·파트원·활동 로그·마스터 같은 전체 개수는 메뉴에 달지 않는다.
    for (const tab of ['announcements', 'projects', 'team', 'activity', 'products', 'duties', 'invites'] as const) {
      expect(model.tabs[tab]).toBeUndefined()
    }
  })

  it('counts an in-progress change application with an unassigned pending task for the leader', () => {
    const data = modelData()
    data.productChangeTasks = data.productChangeTasks.map((task) => (
      task.id === 'task-other' ? { ...task, assignee_id: null } : task
    ))

    const model = buildShellModel({
      data,
      profile: leader,
      leaderMode: true,
      pendingCount: 0,
      unreadReviewsCount: 0,
      notifications: [],
    })

    expect(model.tabs['change-applications']).toEqual({ count: 2, countLabel: '확인할 공통변경 2건' })
  })

  it('marks products with a dot when a product has no owner', () => {
    const data = modelData()
    data.products = [...data.products, { id: 'product-unassigned', name: '담당자 없는 제품' }] as AppData['products']

    const model = buildShellModel({
      data,
      profile: leader,
      leaderMode: true,
      pendingCount: 0,
      unreadReviewsCount: 0,
      notifications: [],
    })

    expect(model.tabs.products).toEqual({ attention: '담당자 없는 제품 있음' })
  })

  it('gives a member only their own pending tasks as a number and unread review news as a dot', () => {
    const model = buildShellModel({
      data: modelData(),
      profile: member,
      leaderMode: false,
      pendingCount: 99,
      unreadReviewsCount: 2,
      notifications,
    })

    expect(model.tabs).toEqual({
      reviews: { unreadCount: 2 },
      'change-applications': { count: 1, countLabel: '미적용 1건' },
    })
  })

  it('shows no action badges to a read-only team leader', () => {
    const teamLeader: Profile = { id: 'team-leader', email: 'tl@example.com', name: '팀장', role: 'team_leader', is_active: true }
    const model = buildShellModel({
      data: modelData(),
      profile: teamLeader,
      leaderMode: true,
      canManage: false,
      pendingCount: 7,
      unreadReviewsCount: 3,
      notifications,
    })

    expect(model.tabs).toEqual({})
  })
})

describe('shellTabAccessibleName', () => {
  it('reads the number, the unread news and the attention mark after the label', () => {
    expect(shellTabAccessibleName('검토요청', { count: 3, countLabel: '대기 3건', unreadCount: 2 }))
      .toBe('검토요청, 대기 3건, 새 소식 2건')
    expect(shellTabAccessibleName('제품', { attention: '담당자 없는 제품 있음' })).toBe('제품, 담당자 없는 제품 있음')
  })

  it('keeps the plain label when there is nothing to announce', () => {
    expect(shellTabAccessibleName('변경 적용', { count: 0, countLabel: '미적용 0건' })).toBeUndefined()
    expect(shellTabAccessibleName('공지', undefined)).toBeUndefined()
  })
})
