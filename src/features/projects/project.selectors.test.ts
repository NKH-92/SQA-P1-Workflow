import { describe, expect, it } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../../demoData'
import {
  selectFilteredProjectAssignments,
  selectProjectGroups,
  selectProjectStatusGroups,
  selectVisibleProjectAssignments,
} from './project.selectors'

describe('project.selectors', () => {
  const data = createPreviewData()

  it('scopes assignments to the current member', () => {
    const scoped = selectVisibleProjectAssignments(data, previewMember, false)
    expect(scoped.every((assignment) => assignment.user_id === previewMember.id)).toBe(true)
  })

  it('filters by status', () => {
    const visible = selectVisibleProjectAssignments(data, previewLeader, true)
    const filtered = selectFilteredProjectAssignments(data, visible, { query: '', status: 'planned' })
    expect(filtered.every((assignment) => assignment.projects?.status === 'planned')).toBe(true)
  })

  it('groups projects for leader view', () => {
    const visible = selectVisibleProjectAssignments(data, previewLeader, true)
    const filtered = selectFilteredProjectAssignments(data, visible, { query: '', status: 'all' })
    const groups = selectProjectGroups(data, previewLeader, true, { query: '', status: 'all' }, filtered)
    expect(groups.length).toBeGreaterThan(0)
    expect(selectProjectStatusGroups(groups).length).toBeGreaterThan(0)
  })
})
