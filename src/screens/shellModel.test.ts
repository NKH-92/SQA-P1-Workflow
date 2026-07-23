import { describe, expect, it } from 'vitest'
import { emptyData } from '../app/constants'
import type { AppData, Profile } from '../types'
import type { AppNotification } from '../lib/notifications'
import { buildShellModel } from './shellModel'

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
      { id: 'task-own', status: 'pending', assignee_id: member.id },
      { id: 'task-other', status: 'pending', assignee_id: otherMember.id },
      { id: 'task-done', status: 'completed', assignee_id: member.id },
    ] as AppData['productChangeTasks'],
    projects: [{ id: 'project-1' }, { id: 'project-2' }, { id: 'project-3' }] as AppData['projects'],
    projectAssignments: [
      { id: 'pa-1', user_id: member.id },
      { id: 'pa-2', user_id: member.id },
      { id: 'pa-3', user_id: otherMember.id },
    ] as AppData['projectAssignments'],
    products: [{ id: 'product-1' }, { id: 'product-2' }] as AppData['products'],
    productAssignments: [
      { id: 'product-a-1', user_id: member.id },
      { id: 'product-a-2', user_id: member.id },
      { id: 'product-a-3', user_id: otherMember.id },
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
  it('keeps pending and unread review counts separate and includes all leader pending change tasks', () => {
    const model = buildShellModel({
      data: modelData(),
      profile: leader,
      leaderMode: true,
      pendingCount: 7,
      unreadReviewsCount: 3,
      notifications,
    })

    expect(model.memberCount).toBe(2)
    expect(model.unreadNotifications).toBe(2)
    expect(model.tabs).toMatchObject({
      announcements: { count: 2 },
      reviews: { count: 7, unreadCount: 3 },
      'change-applications': { count: 2 },
      projects: { count: 3 },
      team: { count: 2 },
      activity: { count: 1 },
      products: { count: 2 },
      duties: { count: 1 },
      invites: { count: 2 },
    })
  })

  it('falls back to the member review count and scopes work counts to that member', () => {
    const model = buildShellModel({
      data: modelData(),
      profile: member,
      leaderMode: false,
      pendingCount: 99,
      unreadReviewsCount: 0,
      notifications,
    })

    expect(model.tabs).toMatchObject({
      reviews: { count: 0, unreadCount: 0 },
      'change-applications': { count: 1 },
      projects: { count: 2 },
      work: { count: 3 },
    })
  })

  it('excludes inactive users from the current member count', () => {
    const data = modelData()
    data.profiles = data.profiles.map((item) => (
      item.id === otherMember.id ? { ...item, is_active: false } : item
    ))

    const model = buildShellModel({
      data,
      profile: leader,
      leaderMode: true,
      pendingCount: 0,
      unreadReviewsCount: 0,
      notifications: [],
    })

    expect(model.memberCount).toBe(1)
    expect(model.tabs.team).toEqual({ count: 1 })
  })
})
