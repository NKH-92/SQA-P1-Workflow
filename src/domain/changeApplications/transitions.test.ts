import { describe, expect, it } from 'vitest'
import { createPreviewData, previewLeader } from '../../demoData'
import {
  reassignProductTasksTransition,
  resolveProductTaskTransition,
} from './transitions'
import {
  FULLY_APPLIED_ARCHIVE_REASON,
  FULLY_PROCESSED_ARCHIVE_REASON,
} from './completion'

function taskFixture() {
  const data = createPreviewData()
  const task = data.productChangeTasks[0]!
  const action = data.changeActionItems.find((item) => item.id === task.action_item_id)!
  const application = data.changeApplications.find((item) => item.id === action.change_application_id)!
  return { data, task, application }
}

describe('change application pure transitions', () => {
  it('injects actor and time while returning data and log facts without mutating input', () => {
    const fixture = taskFixture()
    const before = structuredClone(fixture.data)
    const now = '2026-07-19T01:02:03.000Z'

    const result = resolveProductTaskTransition({
      ...fixture,
      actor: previewLeader,
      now,
      status: 'completed',
      completionNote: '완료 증빙',
      resolutionReason: null,
      proxyReason: '파트장 대리 처리',
      autoArchive: true,
    })

    expect(fixture.data).toEqual(before)
    expect(result.data.productChangeTasks.find((item) => item.id === fixture.task.id)).toMatchObject({
      status: 'completed',
      completed_by: previewLeader.id,
      completed_at: now,
      updated_at: now,
    })
    expect(result.data.changeApplications.find((item) => item.id === fixture.application.id)).toMatchObject({
      archived_at: now,
      archive_origin: 'automatic',
      updated_at: now,
    })
    expect(result.logFacts.map((fact) => fact.action)).toEqual(['completed', 'auto_archived'])
    expect(result.logFacts.every((fact) => fact.actor === previewLeader)).toBe(true)
  })

  it('uses the explicitly supplied assignee and timestamp for reassignment', () => {
    const fixture = taskFixture()
    const result = reassignProductTasksTransition({
      data: fixture.data,
      actor: previewLeader,
      tasks: [fixture.task],
      assigneeId: 'member-explicit',
      assigneeName: 'Explicit Member',
      reason: '담당 조정',
      now: '2026-07-19T04:05:06.000Z',
    })

    expect(result.data.productChangeTasks.find((item) => item.id === fixture.task.id)).toMatchObject({
      assignee_id: 'member-explicit',
      assignee_name: 'Explicit Member',
      updated_at: '2026-07-19T04:05:06.000Z',
    })
    expect(result.logFacts[0]).toMatchObject({
      actor: previewLeader,
      targetUserId: 'member-explicit',
      action: 'reassigned',
    })
  })

  it('persists a distinct completion signal only when every active product is applied', () => {
    const fixture = taskFixture()
    const action = fixture.data.changeActionItems.find((item) => item.id === fixture.task.action_item_id)!
    const isolatedData = {
      ...fixture.data,
      changeApplications: [fixture.application],
      changeActionItems: [action],
      productChangeTasks: [fixture.task],
    }

    const applied = resolveProductTaskTransition({
      ...fixture,
      data: isolatedData,
      actor: previewLeader,
      now: '2026-07-19T06:00:00.000Z',
      status: 'completed',
      completionNote: '제품 반영 확인',
      resolutionReason: null,
      proxyReason: null,
      autoArchive: true,
    })
    const withException = resolveProductTaskTransition({
      ...fixture,
      data: isolatedData,
      actor: previewLeader,
      now: '2026-07-19T06:05:00.000Z',
      status: 'not_applicable',
      completionNote: null,
      resolutionReason: '적용 대상 아님',
      proxyReason: null,
      autoArchive: true,
    })

    expect(applied.data.changeApplications[0]?.archive_reason).toBe(FULLY_APPLIED_ARCHIVE_REASON)
    expect(applied.logFacts[applied.logFacts.length - 1]?.metadata).toMatchObject({ completion_kind: 'all_applied' })
    expect(withException.data.changeApplications[0]?.archive_reason).toBe(FULLY_PROCESSED_ARCHIVE_REASON)
    expect(withException.logFacts[withException.logFacts.length - 1]?.metadata).toMatchObject({ completion_kind: 'processed_with_exceptions' })
  })
})
