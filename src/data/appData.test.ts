import { describe, expect, it } from 'vitest'
import { createEmptyAppData } from './appData'

describe('createEmptyAppData', () => {
  it('creates every AppData slice as an independent empty collection', () => {
    const first = createEmptyAppData()
    const second = createEmptyAppData()

    expect(Object.keys(first).sort()).toEqual([
      'activityLogs', 'allowedUsers', 'announcements', 'auditEvents', 'changeActionItems',
      'changeApplications', 'changeAssigneeOptions', 'changeProductScope', 'duties',
      'dutyAssignments', 'dutyMajorCategories', 'productAssignments', 'productChangeTasks',
      'products', 'profileNotes', 'profiles', 'projectAssignments', 'projects',
      'reviewEvents', 'reviewReadReceipts', 'reviewRequests',
    ])
    expect(Object.values(first).every((value) => Array.isArray(value) && value.length === 0)).toBe(true)
    expect(first).not.toBe(second)
    expect(first.reviewRequests).not.toBe(second.reviewRequests)
  })
})
