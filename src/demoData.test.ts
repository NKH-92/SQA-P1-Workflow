import { describe, expect, it } from 'vitest'
import { createPreviewData } from './demoData'
import {
  demoDutyAllocationRows,
  isDirectDutyAssignee,
  listDutyMajorCategories,
} from './demo/anonymousDutyAllocation'
import { demoProductAllocationRows } from './demo/anonymousProductAllocation'

describe('createPreviewData', () => {
  it('creates preview data from anonymous demo allocation rows', () => {
    const data = createPreviewData()
    const members = data.profiles.filter((profile) => profile.role === 'member')
    const assignedRows = demoProductAllocationRows.filter((row) => row.assigneeName.trim())
    const unassignedRows = demoProductAllocationRows.filter((row) => !row.assigneeName.trim())
    const assigneeNames = new Set<string>(assignedRows.map((row) => row.assigneeName))
    const directDutyRows = demoDutyAllocationRows.filter((row) => isDirectDutyAssignee(row.assigneeName))

    expect(members.length).toBeGreaterThanOrEqual(assigneeNames.size)
    expect(data.products).toHaveLength(demoProductAllocationRows.length)
    expect(data.productAssignments).toHaveLength(assignedRows.length)
    expect(data.products.filter((product) => product.category === '위탁')).toHaveLength(
      demoProductAllocationRows.filter((row) => row.category === '위탁').length,
    )
    expect(
      data.products.filter((product) => !data.productAssignments.some((assignment) => assignment.product_id === product.id)),
    ).toHaveLength(unassignedRows.length)
    expect(data.dutyMajorCategories).toHaveLength(listDutyMajorCategories().length)
    expect(data.duties).toHaveLength(demoDutyAllocationRows.length)
    expect(data.dutyAssignments).toHaveLength(directDutyRows.length)
    expect(data.profileNotes).toHaveLength(0)
    expect(data.reviewRequests).toHaveLength(3)
    expect(data.activityLogs).toHaveLength(3)
    expect(data.reviewRequests.some((request) => request.due_date === null)).toBe(true)
    expect(data.reviewRequests.some((request) => request.due_date === '2026-07-05')).toBe(true)

    for (const member of members) {
      if (!assigneeNames.has(member.name)) continue
      const sourceCount = assignedRows.filter((row) => row.assigneeName === member.name).length
      expect(data.productAssignments.filter((assignment) => assignment.user_id === member.id)).toHaveLength(sourceCount)
    }

    for (const row of directDutyRows) {
      const duty = data.duties.find((item) => item.name === row.dutyName)
      expect(duty?.notes).toBe(row.notes)
      expect(data.dutyAssignments.some((assignment) => assignment.duty_id === duty?.id)).toBe(true)
    }
  })
})
