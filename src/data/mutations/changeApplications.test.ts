import { describe, expect, it } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../../demoData'
import type { AppData, Profile } from '../../types'
import type { RepositoryContext } from '../repositoryContext'
import {
  cancelProductChangeTask,
  completeProductChangeTask,
  reopenProductChangeTask,
  saveChangeApplication,
} from './changeApplications'
import type { ChangeApplicationInput } from '../../features/change-applications/types'
import { createLocalChangeApplicationRepository } from '../local/localChangeApplicationRepository'

function harness(initial = createPreviewData()) {
  let current = initial
  const setData: RepositoryContext['setData'] = (next) => {
    current = typeof next === 'function' ? next(current) : next
  }
  const context = (profile: Profile): RepositoryContext => ({
    isRemote: false,
    profile,
    data: current,
    setData,
  })
  return { get data() { return current }, context }
}

function input(data: AppData): ChangeApplicationInput {
  return {
    changeApplicationId: null,
    expected_updated_at: null,
    change_number: 'CC-TEST-LOCAL-001',
    source: 'official',
    title: '로컬 원자 등록',
    summary: '한 번에 공통 정보와 제품 업무를 생성합니다.',
    source_url: null,
    effective_date: '2026-09-01',
    action_kind: 'product_standard',
    custom_kind_name: null,
    action_content: '제품표준서를 개정합니다.',
    due_date: '2026-08-28',
    tasks: [
      { product_id: data.changeProductScope[0].product_id, assignee_id: previewMember.id },
      { product_id: data.changeProductScope.find((row) => row.product_id !== data.changeProductScope[0].product_id)!.product_id, assignee_id: null },
    ],
  }
}

describe('local change application mutations', () => {
  it('atomically creates one common record, one action, and every selected product task', async () => {
    const state = harness()
    const payload = input(state.data)

    const applicationId = await saveChangeApplication(state.context(previewLeader), payload, true)

    const application = state.data.changeApplications.find((item) => item.id === applicationId)
    const actions = state.data.changeActionItems.filter((item) => item.change_application_id === applicationId)
    const tasks = state.data.productChangeTasks.filter((item) => item.action_item_id === actions[0].id)
    expect(application).toMatchObject({ change_number: 'CC-TEST-LOCAL-001', status: 'published' })
    expect(actions).toHaveLength(1)
    expect(tasks).toHaveLength(2)
    expect(tasks.map((task) => task.assignee_id)).toEqual([previewMember.id, null])
    expect(state.data.activityLogs[0]).toMatchObject({ entity_type: 'change_application', action: 'published' })
  })

  it('keeps completed rows, records completion evidence, and supports audited reopen', async () => {
    const state = harness()
    const applicationId = await saveChangeApplication(state.context(previewLeader), input(state.data), true)
    const actionId = state.data.changeActionItems.find((item) => item.change_application_id === applicationId)!.id
    const task = state.data.productChangeTasks.find((item) => item.action_item_id === actionId && item.assignee_id === previewMember.id)!

    await completeProductChangeTask(state.context(previewMember), task.id, 'Rev.12 반영', '')
    expect(state.data.productChangeTasks.find((item) => item.id === task.id)).toMatchObject({
      status: 'completed',
      completed_by: previewMember.id,
      completion_note: 'Rev.12 반영',
    })
    expect(state.data.productChangeTasks.some((item) => item.id === task.id)).toBe(true)

    await reopenProductChangeTask(state.context(previewMember), task.id, '개정본 재확인')
    expect(state.data.productChangeTasks.find((item) => item.id === task.id)).toMatchObject({
      status: 'pending',
      reopened_by: previewMember.id,
      reopen_reason: '개정본 재확인',
    })
    await expect(saveChangeApplication(state.context(previewLeader), {
      ...input(state.data),
      changeApplicationId: applicationId,
      expected_updated_at: state.data.changeApplications.find((item) => item.id === applicationId)!.updated_at,
      title: '재개 후에도 바꿀 수 없는 제목',
    }, true)).rejects.toThrow('한 제품이라도 처리된 뒤')
  })

  it('blocks a non-assignee and locks content after the first completed task', async () => {
    const state = harness()
    const payload = input(state.data)
    const applicationId = await saveChangeApplication(state.context(previewLeader), payload, true)
    const actionId = state.data.changeActionItems.find((item) => item.change_application_id === applicationId)!.id
    const task = state.data.productChangeTasks.find((item) => item.action_item_id === actionId && item.assignee_id === previewMember.id)!
    const other = state.data.profiles.find((item) => item.role === 'member' && item.id !== previewMember.id)!

    await expect(completeProductChangeTask(state.context(other), task.id, '', '')).rejects.toThrow('지정된 담당자')
    await completeProductChangeTask(state.context(previewMember), task.id, '', '')
    await expect(saveChangeApplication(state.context(previewLeader), {
      ...payload,
      changeApplicationId: applicationId,
      expected_updated_at: state.data.changeApplications.find((item) => item.id === applicationId)!.updated_at,
      title: '처리 후 바꾸려는 제목',
    }, true)).rejects.toThrow('한 제품이라도 처리된 뒤')
  })

  it('rejects a direct local save that would reactivate a cancelled product task', async () => {
    const state = harness()
    const payload = input(state.data)
    const applicationId = await saveChangeApplication(state.context(previewLeader), payload, true)
    const actionId = state.data.changeActionItems.find((item) => item.change_application_id === applicationId)!.id
    const task = state.data.productChangeTasks.find((item) => item.action_item_id === actionId)!

    await cancelProductChangeTask(state.context(previewLeader), task.id, '적용 범위에서 제외')
    const repository = createLocalChangeApplicationRepository(state.context(previewLeader))

    await expect(repository.saveChangeApplication({
      ...payload,
      changeApplicationId: applicationId,
      expected_updated_at: state.data.changeApplications.find((item) => item.id === applicationId)!.updated_at,
      title: '취소된 업무를 다시 포함하는 수정',
    }, true)).rejects.toThrow('한 제품이라도 처리된 뒤에는 변경 내용을 수정할 수 없습니다.')

    expect(state.data.changeApplications.find((item) => item.id === applicationId)?.title).toBe(payload.title)
    expect(state.data.productChangeTasks.find((item) => item.id === task.id)?.status).toBe('cancelled')
  })

  it('rejects a stale direct local save without changing application or task state', async () => {
    const state = harness()
    const payload = input(state.data)
    const applicationId = await saveChangeApplication(state.context(previewLeader), payload, true)
    const before = state.data
    const repository = createLocalChangeApplicationRepository(state.context(previewLeader))

    await expect(repository.saveChangeApplication({
      ...payload,
      changeApplicationId: applicationId,
      expected_updated_at: '2026-01-01T00:00:00.000Z',
      title: '오래된 화면에서 저장한 제목',
    }, true)).rejects.toThrow('다른 사용자가 변경건을 수정했습니다. 새로고침 후 다시 시도해 주세요.')

    expect(state.data).toBe(before)
    expect(state.data.changeApplications.find((item) => item.id === applicationId)?.title).toBe(payload.title)
  })
})
