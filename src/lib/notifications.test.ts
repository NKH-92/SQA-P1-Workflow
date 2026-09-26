import { describe, expect, it } from 'vitest'
import { emptyData } from '../app/constants'
import type { AppData, Profile, ReviewEvent, ReviewRequest } from '../types'
import { buildNotifications } from './notifications'

const now = Date.parse('2026-07-06T03:00:00.000Z')
const leader: Profile = { id: 'leader', email: 'leader@example.com', name: '파트장', role: 'leader', is_active: true }
const teamLeader: Profile = { id: 'team-leader', email: 'tl@example.com', name: '팀장', role: 'team_leader', is_active: true }
const member: Profile = { id: 'member', email: 'member@example.com', name: '파트원 C', role: 'member', is_active: true }

function request(overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    id: 'review-1',
    requester_id: member.id,
    title: '결제 화면 문구 확인',
    description: '',
    due_date: null,
    status: 'pending',
    created_at: '2026-07-05T00:00:00.000Z',
    profiles: { name: member.name, email: member.email },
    ...overrides,
  }
}

function event(overrides: Partial<ReviewEvent> = {}): ReviewEvent {
  return {
    id: 1,
    review_request_id: 'review-1',
    actor_id: member.id,
    actor_name_snapshot: member.name,
    event_type: 'submitted',
    from_status: null,
    to_status: 'pending',
    occurred_at: '2026-07-06T02:30:00.000Z',
    metadata: {},
    transaction_id: 1,
    ...overrides,
  }
}

function project(id: string, deadline: string, status: 'planned' | 'in_progress' | 'done' = 'in_progress') {
  return { id, name: `프로젝트 ${id}`, description: '', deadline, status, created_by: leader.id }
}

describe('buildNotifications', () => {
  it('tells the leader who asked for a review in 해요체 and deep-links to it', () => {
    const data: AppData = { ...emptyData, reviewRequests: [request()], reviewEvents: [event()] }

    const [item] = buildNotifications(leader, data, true, now)

    expect(item).toMatchObject({
      title: '파트원 C가 ‘결제 화면 문구 확인’ 검토를 요청했어요.',
      kind: '검토요청',
      section: 'news',
      unread: true,
      tab: 'reviews',
      entityId: 'review-1',
      when: '30분 전',
    })
  })

  it('calls a resubmission a re-request', () => {
    const data: AppData = {
      ...emptyData,
      reviewRequests: [request({ review_round: 2 })],
      reviewEvents: [event({ event_type: 'resubmitted' })],
    }

    expect(buildNotifications(leader, data, true, now)[0]).toMatchObject({
      title: '파트원 C가 ‘결제 화면 문구 확인’ 검토를 다시 요청했어요.',
      kind: '재요청',
    })
  })

  it.each([
    ['approved', '파트장이 ‘결제 화면 문구 확인’을 승인했어요.', '승인'],
    ['rejected', '파트장이 ‘결제 화면 문구 확인’을 반려했어요.', '반려'],
    ['feedback_added', '파트장이 ‘결제 화면 문구 확인’에 피드백을 남겼어요.', '피드백'],
    ['reopened', '파트장이 ‘결제 화면 문구 확인’을 다시 열었어요.', '다시 열기'],
  ] as const)('tells the member that the leader %s their request actively', (eventType, title, kind) => {
    const data: AppData = {
      ...emptyData,
      reviewRequests: [request({ status: eventType === 'rejected' ? 'rejected' : 'approved' })],
      reviewEvents: [event({ event_type: eventType, actor_id: leader.id, actor_name_snapshot: leader.name })],
    }

    expect(buildNotifications(member, data, false, now)[0]).toMatchObject({ title, kind, section: 'news' })
  })

  it('sends nothing actionable to a read-only team leader', () => {
    const data: AppData = {
      ...emptyData,
      reviewRequests: [request()],
      reviewEvents: [event()],
      projects: [project('late', '2026-07-01')],
    }

    expect(buildNotifications(teamLeader, data, true, now)).toEqual([])
  })

  it('groups several overdue projects into one reminder that opens the projects screen', () => {
    const data: AppData = {
      ...emptyData,
      reviewRequests: [request()],
      reviewEvents: [event()],
      projects: [
        project('late-1', '2026-07-01'),
        project('late-2', '2026-06-20'),
        project('done', '2026-06-01', 'done'),
        project('today', '2026-07-06'),
      ],
    }

    const items = buildNotifications(leader, data, true, now)

    expect(items.map((item) => item.section)).toEqual(['news', 'reminder', 'reminder'])
    expect(items[1]).toMatchObject({
      id: 'projects-overdue',
      title: '기한이 지난 프로젝트 2개',
      when: '기한 지남',
      tab: 'projects',
    })
    expect(items[1].entityId).toBeUndefined()
    expect(items[2]).toMatchObject({
      title: '‘프로젝트 today’ 프로젝트 마감일이 오늘이에요.',
      when: '오늘 마감',
      entityId: 'today',
    })
  })

  it('keeps a single overdue project as its own deep link', () => {
    const data: AppData = { ...emptyData, projects: [project('late', '2026-07-01')] }

    expect(buildNotifications(leader, data, true, now)).toEqual([
      expect.objectContaining({
        id: 'project-late',
        title: '‘프로젝트 late’ 프로젝트 마감일이 5일 지났어요.',
        when: '5일 지남',
        tab: 'projects',
        entityId: 'late',
      }),
    ])
  })

  it('reminds a member only about their own projects', () => {
    const data: AppData = {
      ...emptyData,
      projects: [project('mine', '2026-07-08'), project('other', '2026-07-08')],
      projectAssignments: [{ id: 'pa-1', project_id: 'mine', user_id: member.id, notes: null }],
    }

    expect(buildNotifications(member, data, false, now)).toEqual([
      expect.objectContaining({ title: '‘프로젝트 mine’ 프로젝트 마감까지 2일 남았어요.', when: 'D-2', entityId: 'mine' }),
    ])
  })
})
