import { describe, expect, it } from 'vitest'
import { createPreviewData, previewMember } from '../../demoData'
import type { AppData, Profile } from '../../types'
import { isMemberHomeFilter, selectMemberHomeItems } from './memberHomeModel'

const now = new Date('2026-07-06T12:00:00')

function withProjects(data: AppData, profile: Profile) {
  data.projects = [
    { id: 'late', name: '지난 프로젝트', description: '', deadline: '2026-07-01', status: 'in_progress', created_by: 'leader' },
    { id: 'soon', name: '곧 마감', description: '', deadline: '2026-07-08', status: 'planned', created_by: 'leader' },
    { id: 'done', name: '끝난 프로젝트', description: '', deadline: '2026-06-01', status: 'done', created_by: 'leader' },
    { id: 'none', name: '마감일 없는 프로젝트', description: '', deadline: null, status: 'in_progress', created_by: 'leader' },
  ]
  data.projectAssignments = data.projects.map((project) => ({
    id: `pa-${project.id}`,
    project_id: project.id,
    user_id: profile.id,
    notes: null,
  }))
  return data
}

describe('selectMemberHomeItems', () => {
  it('orders overdue work first, leaves finished projects out and never mislabels overdue as imminent', () => {
    const data = withProjects(createPreviewData(), previewMember)
    data.reviewRequests = []
    data.productChangeTasks = []

    const items = selectMemberHomeItems(data, previewMember, now)

    expect(items.map((item) => [item.title, item.statusLabel])).toEqual([
      ['지난 프로젝트', '5일 지남'],
      ['곧 마감', 'D-2'],
      ['마감일 없는 프로젝트', '마감일 없음'],
    ])
    expect(items.every((item) => item.targetTab === 'projects' && item.entityId)).toBe(true)
  })

  it('lists pending and rejected own review requests with their status names', () => {
    const data = createPreviewData()
    data.projectAssignments = []
    data.productChangeTasks = []
    data.reviewRequests = [
      { id: 'r1', requester_id: previewMember.id, title: '대기 요청', description: '', due_date: null, status: 'pending', created_at: '2026-07-05T00:00:00.000Z' },
      { id: 'r2', requester_id: previewMember.id, title: '반려된 요청', description: '', due_date: null, status: 'rejected', created_at: '2026-07-01T00:00:00.000Z' },
      { id: 'r3', requester_id: previewMember.id, title: '승인된 요청', description: '', due_date: null, status: 'approved', created_at: '2026-07-01T00:00:00.000Z' },
      { id: 'r4', requester_id: 'someone-else', title: '남의 요청', description: '', due_date: null, status: 'pending', created_at: '2026-07-01T00:00:00.000Z' },
    ]

    const items = selectMemberHomeItems(data, previewMember, now)

    expect(items.map((item) => [item.title, item.statusLabel])).toEqual([
      ['반려된 요청', '반려'],
      ['대기 요청', '대기 중'],
    ])
    expect(items[0].meta).toBe('반려 사유를 확인하고 고쳐서 다시 요청해 주세요')
    expect(items[1].meta).toMatch(/^아직 피드백이 없어요 · /)
  })

  it('shows my pending change tasks with the product as context', () => {
    const data = createPreviewData()
    const items = selectMemberHomeItems(data, previewMember).filter((item) => item.category === 'task')

    expect(items.length).toBeGreaterThan(0)
    expect(items[0].kind).toMatch(/^적용 업무 · /)
    expect(items[0].targetTab).toBe('change-applications')
  })

  it('validates stored filter values', () => {
    expect(isMemberHomeFilter('task')).toBe(true)
    expect(isMemberHomeFilter('unknown')).toBe(false)
  })
})
