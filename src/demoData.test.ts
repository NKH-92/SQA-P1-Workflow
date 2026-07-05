import { describe, expect, it } from 'vitest'
import { createPreviewData } from './demoData'
import { p1ProductAllocationRows } from './data/p1ProductAllocation'

describe('createPreviewData', () => {
  it('creates preview data from the P1 product allocation sheet', () => {
    const data = createPreviewData()
    const members = data.profiles.filter((profile) => profile.role === 'member')
    const assignedRows = p1ProductAllocationRows.filter((row) => row.assigneeName.trim())
    const unassignedRows = p1ProductAllocationRows.filter((row) => !row.assigneeName.trim())
    const assigneeNames = new Set(assignedRows.map((row) => row.assigneeName))

    expect(members).toHaveLength(assigneeNames.size)
    expect(data.products).toHaveLength(p1ProductAllocationRows.length)
    expect(data.productAssignments).toHaveLength(assignedRows.length)
    expect(data.products.filter((product) => product.category === '위탁')).toHaveLength(110)
    expect(data.products.filter((product) => !data.productAssignments.some((assignment) => assignment.product_id === product.id))).toHaveLength(unassignedRows.length)
    expect(data.dutyAssignments).toHaveLength(members.length * 2)
    expect(data.projectAssignments).toHaveLength(members.length * 2)
    expect(data.profileNotes).toHaveLength(0)
    expect(data.reviewRequests).toHaveLength(3)
    expect(data.activityLogs).toHaveLength(3)
    expect(data.reviewRequests.some((request) => request.due_date === null)).toBe(true)
    expect(data.reviewRequests.some((request) => request.due_date === '2026-07-05')).toBe(true)

    for (const member of members) {
      const sourceCount = assignedRows.filter((row) => row.assigneeName === member.name).length
      expect(data.productAssignments.filter((assignment) => assignment.user_id === member.id)).toHaveLength(sourceCount)
      expect(data.dutyAssignments.filter((assignment) => assignment.user_id === member.id)).toHaveLength(2)
      expect(data.projectAssignments.filter((assignment) => assignment.user_id === member.id)).toHaveLength(2)
    }
  })
})
