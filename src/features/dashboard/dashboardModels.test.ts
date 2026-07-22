import { describe, expect, it } from 'vitest'
import type { AppData, Profile } from '../../types'
import {
  buildReviewResolutionSummary,
  buildTeamAllocations,
  leaderReviewRange,
  selectActiveProjects,
} from './dashboardModels'

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

const member = (id: string, name: string, isActive = true): Profile => ({
  id,
  email: `${id}@example.test`,
  name,
  role: 'member',
  is_active: isActive,
})

describe('dashboard models', () => {
  it('keeps resolution percentages bounded and omits a percentage without submissions', () => {
    expect(buildReviewResolutionSummary({ submitted: 0, approved: 2, rejected: 1 })).toMatchObject({
      resolved: 3,
      remaining: 0,
      percent: null,
    })
    expect(buildReviewResolutionSummary({ submitted: 2, approved: 3, rejected: 1 })).toMatchObject({
      resolved: 4,
      remaining: 0,
      percent: 100,
    })
  })

  it('counts only active-project assignments and does not label the result as workload', () => {
    const data = emptyData()
    data.projects = [
      { id: 'active', name: '진행', description: '', deadline: '2026-07-31', status: 'in_progress', created_by: 'l1' },
      { id: 'done', name: '완료', description: '', deadline: '2026-07-01', status: 'done', created_by: 'l1' },
    ]
    data.products = [{ id: 'p1', name: '제품', category: '자사' }]
    data.productAssignments = [{ id: 'pa1', user_id: 'm1', product_id: 'p1' }]
    data.dutyAssignments = [{ id: 'da1', user_id: 'm1', duty_id: 'd1' }]
    data.projectAssignments = [
      { id: 'pra1', user_id: 'm1', project_id: 'active', notes: null },
      { id: 'pra2', user_id: 'm1', project_id: 'done', notes: null },
    ]

    const rows = buildTeamAllocations(data, [member('m1', '가람'), member('m2', '나래'), member('m3', '비활성', false)])

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ productCount: 1, dutyCount: 1, activeProjectCount: 1, totalCount: 3, relativePercent: 100 })
    expect(rows[1]).toMatchObject({ totalCount: 0, relativePercent: 0 })
  })

  it('sorts unfinished projects by deadline and creates a six-month business range', () => {
    const data = emptyData()
    data.projects = [
      { id: 'none', name: '기한 없음', description: '', deadline: null, status: 'planned', created_by: 'l1' },
      { id: 'done', name: '완료', description: '', deadline: '2026-07-01', status: 'done', created_by: 'l1' },
      { id: 'soon', name: '임박', description: '', deadline: '2026-07-10', status: 'in_progress', created_by: 'l1' },
    ]

    expect(selectActiveProjects(data).map((project) => project.id)).toEqual(['soon', 'none'])
    expect(leaderReviewRange('2026-01-22')).toEqual({ from: '2025-08-01', to: '2026-01-22' })
  })
})
