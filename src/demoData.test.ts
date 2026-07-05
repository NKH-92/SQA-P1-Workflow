import { describe, expect, it } from 'vitest'
import { createPreviewData } from './demoData'
import { isP1DirectDutyAssignee, listP1DutyMajorCategories, p1DutyAllocationRows } from './data/p1DutyAllocation'
import { p1ProductAllocationRows } from './data/p1ProductAllocation'

describe('createPreviewData', () => {
  it('creates preview data from the P1 product allocation sheet', () => {
    const data = createPreviewData()
    const members = data.profiles.filter((profile) => profile.role === 'member')
    const assignedRows = p1ProductAllocationRows.filter((row) => row.assigneeName.trim())
    const unassignedRows = p1ProductAllocationRows.filter((row) => !row.assigneeName.trim())
    const assigneeNames = new Set<string>(assignedRows.map((row) => row.assigneeName))
    const directDutyRows = p1DutyAllocationRows.filter((row) => isP1DirectDutyAssignee(row.assigneeName))

    expect(members).toHaveLength(assigneeNames.size + 3)
    expect(data.products).toHaveLength(p1ProductAllocationRows.length)
    expect(data.productAssignments).toHaveLength(assignedRows.length)
    expect(data.products.filter((product) => product.category === '위탁')).toHaveLength(110)
    expect(data.products.filter((product) => !data.productAssignments.some((assignment) => assignment.product_id === product.id))).toHaveLength(unassignedRows.length)
    expect(data.dutyMajorCategories).toHaveLength(listP1DutyMajorCategories().length)
    expect(data.duties).toHaveLength(p1DutyAllocationRows.length)
    expect(data.dutyAssignments).toHaveLength(directDutyRows.length)
    expect(data.projectAssignments).toHaveLength(members.filter((member) => p1AssigneeNames.has(member.name)).length * 2)
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

const p1AssigneeNames = new Set(
  p1ProductAllocationRows.map((row) => row.assigneeName.trim()).filter(Boolean),
)
