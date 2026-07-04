import { describe, expect, it } from 'vitest'
import { createPreviewData } from './demoData'

describe('createPreviewData', () => {
  it('creates five members with ten products, two duties, and two projects each', () => {
    const data = createPreviewData()
    const members = data.profiles.filter((profile) => profile.role === 'member')

    expect(members).toHaveLength(5)
    expect(data.products).toHaveLength(50)
    expect(data.productAssignments).toHaveLength(50)
    expect(data.dutyAssignments).toHaveLength(10)
    expect(data.projectAssignments).toHaveLength(10)
    expect(data.profileNotes).toHaveLength(5)
    expect(data.reviewRequests).toHaveLength(3)
    expect(data.activityLogs).toHaveLength(3)
    expect(data.reviewRequests.some((request) => request.due_date === null)).toBe(true)
    expect(data.reviewRequests.some((request) => request.due_date === '2026-07-05')).toBe(true)

    for (const member of members) {
      expect(data.productAssignments.filter((assignment) => assignment.user_id === member.id)).toHaveLength(10)
      expect(data.dutyAssignments.filter((assignment) => assignment.user_id === member.id)).toHaveLength(2)
      expect(data.projectAssignments.filter((assignment) => assignment.user_id === member.id)).toHaveLength(2)
      expect(data.profileNotes.filter((note) => note.profile_id === member.id)).toHaveLength(1)
    }
  })
})
