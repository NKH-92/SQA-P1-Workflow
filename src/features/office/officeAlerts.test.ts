import { describe, expect, it } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../../demoData'
import type { AppData } from '../../types'
import { buildOfficeAlerts } from './officeAlerts'

const NOW = Date.parse('2026-09-27T03:00:00.000Z')

function withAllSeen(data: AppData, userId: string): AppData {
  return {
    ...data,
    sectionReadMarks: (['announcements', 'projects', 'change-applications'] as const).map((section) => ({
      user_id: userId,
      section,
      seen_keys: [
        ...data.announcements.map((announcement) => announcement.id),
        ...data.projectAssignments.map((assignment) => assignment.id),
        ...data.productChangeTasks.map((task) => task.id),
        ...data.changeApplications.map((application) => application.id),
      ],
      seen_at: '2026-09-27T00:00:00.000Z',
    })),
  }
}

describe('office alerts', () => {
  it('gives read-only team leaders no alerts, like the notification center', () => {
    expect(buildOfficeAlerts({ ...previewLeader, role: 'team_leader' }, createPreviewData(), NOW)).toEqual({})
  })

  it('shows a member what is new: an announcement and a project assignment, each opening the new item', () => {
    const data = createPreviewData()
    const alerts = buildOfficeAlerts(previewMember, data, NOW)
    expect(alerts.notice).toEqual({ level: 'new', count: 1, description: '새 공지 1건', targetId: 'announcement-01' })
    const newAssignment = data.projectAssignments.find((assignment) => assignment.id === 'project-assignment-1-1')!
    expect(alerts.projects).toMatchObject({ level: 'new', count: 1, targetId: newAssignment.project_id })
    expect(alerts.projects?.description).toMatch(/^새로 배정된 프로젝트 1건/)
  })

  it('keeps showing work that is still pending after it has been seen, without an exclamation mark', () => {
    const data = withAllSeen(createPreviewData(), previewMember.id)
    const alerts = buildOfficeAlerts(previewMember, data, NOW)
    expect(alerts.notice).toBeUndefined()
    expect(alerts.cabinet).toMatchObject({ level: 'todo' })
    expect(alerts.cabinet?.description).toMatch(/^미적용 업무 \d+건$/)
    expect(alerts.cabinet?.targetId).toBeUndefined()
  })

  it('announces new change tasks, including ones handed over from someone else', () => {
    const base = withAllSeen(createPreviewData(), previewMember.id)
    const handedOver = base.productChangeTasks.find((task) => task.status === 'pending' && task.assignee_id !== previewMember.id)!
    const data = {
      ...base,
      productChangeTasks: base.productChangeTasks.map((task) =>
        task.id === handedOver.id ? { ...task, id: 'task-handed-over', assignee_id: previewMember.id } : task),
    }
    const alerts = buildOfficeAlerts(previewMember, data, NOW)
    expect(alerts.cabinet).toMatchObject({ level: 'new', count: 1 })
    expect(alerts.cabinet?.description).toMatch(/^새 적용 업무 1건 · 미적용 업무 \d+건$/)
  })

  it('tells a member about new review results and opens the latest one', () => {
    const data = createPreviewData()
    const mine = data.reviewRequests.find((request) => request.requester_id === previewMember.id)!
    const withResult: AppData = {
      ...data,
      reviewEvents: [
        ...(data.reviewEvents ?? []),
        {
          id: '999999',
          review_request_id: mine.id,
          event_type: 'feedback_added',
          actor_id: previewLeader.id,
          actor_name_snapshot: previewLeader.name,
          occurred_at: '2026-09-27T02:00:00.000Z',
        } as NonNullable<AppData['reviewEvents']>[number],
      ],
    }
    expect(buildOfficeAlerts(previewMember, withResult, NOW).kanban).toEqual({
      level: 'new',
      count: 1,
      description: '새 검토 결과 1건',
      targetId: mine.id,
    })
  })

  it('shows the leader new review requests on top of the ones waiting for feedback', () => {
    const data = createPreviewData()
    const pending = data.reviewRequests.filter((request) => request.status === 'pending')
    const alerts = buildOfficeAlerts(previewLeader, data, NOW)
    expect(alerts.kanban).toMatchObject({ level: 'new' })
    expect(alerts.kanban?.description).toMatch(new RegExp(`^새 검토요청 \\d+건 · 피드백 대기 ${pending.length}건$`))
    expect(pending.map((request) => request.id)).toContain(alerts.kanban?.targetId)

    // 모두 읽었으면 대기 건수만 남는다.
    const allRead: AppData = {
      ...data,
      reviewReadReceipts: pending.map((request) => ({
        user_id: previewLeader.id,
        review_request_id: request.id,
        last_seen_event_id: '99999999',
        read_at: '2026-09-27T00:00:00.000Z',
      })),
    }
    expect(buildOfficeAlerts(previewLeader, allRead, NOW).kanban).toEqual({
      level: 'todo',
      count: pending.length,
      description: `피드백 대기 ${pending.length}건`,
    })
  })

  it('counts projects near or past their deadline, but not finished ones', () => {
    const data = createPreviewData()
    const today = '2026-09-27'
    const projects = data.projects.map((project, index) => ({
      ...project,
      deadline: index === 0 ? today : index === 1 ? '2026-12-31' : project.deadline,
      status: index === 2 ? 'done' as const : project.status,
    }))
    const expected = projects.filter((project, index) =>
      index !== 1 && project.status !== 'done' && project.deadline != null && project.deadline <= '2026-09-30').length
    const alerts = buildOfficeAlerts(previewLeader, { ...data, projects }, NOW)
    expect(alerts.projects).toEqual({ level: 'todo', count: expected, description: `마감 확인할 프로젝트 ${expected}건` })
  })

  it('does not show anything as new until the read marks are known', () => {
    const data = { ...createPreviewData(), sectionReadMarks: undefined }
    const alerts = buildOfficeAlerts(previewMember, data, NOW)
    expect(alerts.notice).toBeUndefined()
    expect(alerts.projects?.level).not.toBe('new')
  })
})
