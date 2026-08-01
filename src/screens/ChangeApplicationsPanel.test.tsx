import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../demoData'
import * as dataModule from '../data'
import type { AppData, ProductChangeTask } from '../types'
import { ChangeApplicationsPanel } from './ChangeApplicationsPanel'

function runMutation(operation: () => Promise<void>) {
  return operation().then(() => true)
}

function finalReviewData(): AppData {
  const data = createPreviewData()
  const application = data.changeApplications.find((item) => item.id === 'change-application-01')!
  const actionIds = new Set(data.changeActionItems
    .filter((item) => item.change_application_id === application.id)
    .map((item) => item.id))
  data.productChangeTasks = data.productChangeTasks.map((task, index) => {
    if (!actionIds.has(task.action_item_id)) return task
    if (index === 1) {
      return {
        ...task,
        status: 'not_applicable' as const,
        resolution_reason: '이 제품은 변경 원료를 사용하지 않음',
        completed_at: '2026-07-22T02:00:00.000Z',
        completed_by: task.assignee_id,
        completed_by_name: task.assignee_name,
      }
    }
    return {
      ...task,
      status: 'completed' as const,
      completion_note: '제품표준서 반영 완료',
      completed_at: '2026-07-22T02:00:00.000Z',
      completed_by: task.assignee_id,
      completed_by_name: task.assignee_name,
    }
  })
  data.changeApplicationSummaries = [{
    change_application_id: application.id,
    workflow_status: 'final_review_ready',
    total_count: 12,
    pending_count: 0,
    completed_count: 11,
    not_applicable_count: 1,
    scope_removed_count: 0,
    unresolved_cancelled_count: 0,
    unassigned_count: 0,
    processed_count: 12,
    percent: 100,
    can_finalize: true,
  }]
  return data
}

function completedHistoryData(): AppData {
  const data = finalReviewData()
  data.changeApplications = data.changeApplications.map((application) => application.id === 'change-application-01'
    ? {
        ...application,
        final_completed_at: '2026-07-23T03:00:00.000Z',
        final_completed_by: previewLeader.id,
        final_completed_by_name: previewLeader.name,
        final_completion_note: '예외 사유 확인 후 최종 완료',
        updated_at: '2026-07-23T03:00:00.000Z',
      }
    : application)
  data.changeApplicationSummaries = data.changeApplicationSummaries?.map((summary) => ({
    ...summary,
    workflow_status: 'completed',
    can_finalize: false,
  }))
  return data
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ChangeApplicationsPanel', () => {
  it('shows leader workflow tabs and keeps registration leader-only', () => {
    const data = createPreviewData()
    const leaderView = render(
      <ChangeApplicationsPanel profile={previewLeader} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    expect(screen.getByRole('heading', { name: '변경 적용' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '진행 중' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /최종 확인 대기/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '완료 이력' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '공통변경 등록' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '담당자별' })).toBeInTheDocument()

    leaderView.unmount()
    render(
      <ChangeApplicationsPanel profile={previewMember} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    expect(screen.getByRole('tab', { name: /내 미적용/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '처리 이력' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '공통변경 등록' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '담당자별' })).not.toBeInTheDocument()
  })

  it('uses a three-step composer and blocks publish until every product has an active owner', () => {
    const data = createPreviewData()
    const product = data.changeProductScope[0]
    render(
      <ChangeApplicationsPanel profile={previewLeader} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: '공통변경 등록' }))
    expect(screen.getByRole('navigation', { name: '공통변경 등록 단계' })).toBeInTheDocument()
    expect(screen.getByText('변경 정보')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '적용제품 선택 목록' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('변경번호'), { target: { value: 'CC-2026-099' } })
    fireEvent.change(screen.getByLabelText('변경 제목'), { target: { value: '시험 방법 공통 개정' } })
    fireEvent.change(screen.getByLabelText('변경 요약'), { target: { value: '시험 방법 변경을 모든 대상 제품에 반영합니다.' } })
    fireEvent.change(screen.getByLabelText('시행일'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('적용 내용'), { target: { value: '제품표준서 시험 방법을 개정합니다.' } })
    fireEvent.change(screen.getByLabelText('적용기한'), { target: { value: '2026-08-25' } })
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))

    const scope = screen.getByRole('list', { name: '적용제품 선택 목록' })
    fireEvent.click(within(scope).getByRole('button', { name: new RegExp(product.product_name) }))
    expect(screen.getByLabelText(`${product.product_name} 적용 책임자`)).not.toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))

    expect(screen.getAllByText('최종 검토·배포')).toHaveLength(2)
    expect(screen.getByText('모든 제품에 활성 책임자 지정 완료')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1개 제품에 배포' })).toBeEnabled()
  })

  it('shows process actions only to the assigned member, never to the leader', () => {
    const data = createPreviewData()
    const ownTask = data.productChangeTasks.find(
      (task) => task.assignee_id === previewMember.id && task.status === 'pending',
    )!

    const memberView = render(
      <ChangeApplicationsPanel profile={previewMember} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )
    expect(screen.getAllByRole('button', { name: '적용 완료' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: '해당 없음' }).length).toBeGreaterThan(0)

    memberView.unmount()
    render(
      <ChangeApplicationsPanel profile={previewLeader} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: '적용 완료' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '해당 없음' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: `${ownTask.product_name} 담당자 변경` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `${ownTask.product_name} 범위 제외` })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `${ownTask.product_name} 업무 취소` })).not.toBeInTheDocument()
  })

  it('routes the leader pending-task action through scope removal', async () => {
    const data = createPreviewData()
    const task = data.productChangeTasks.find((item) => item.status === 'pending')!
    const removeScopeSpy = vi.spyOn(dataModule, 'removeProductChangeScope').mockResolvedValue()
    render(
      <ChangeApplicationsPanel profile={previewLeader} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: `${task.product_name} 범위 제외` }))
    expect(screen.getByRole('heading', { name: '이 제품을 적용범위에서 제외할까요?' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('적용범위 제외 사유'), { target: { value: '변경 대상 아님' } })
    fireEvent.click(screen.getByRole('button', { name: '범위 제외' }))

    await waitFor(() => expect(removeScopeSpy).toHaveBeenCalledOnce())
    expect(removeScopeSpy.mock.calls[0].slice(1)).toEqual([task.id, '변경 대상 아님'])
  })

  it('offers recovery reassignment for terminal work owned by an inactive assignee', async () => {
    const data = createPreviewData()
    const task = data.productChangeTasks.find((item) => item.status === 'completed' && item.assignee_id)!
    const previousAssigneeId = task.assignee_id!
    const replacement = data.changeAssigneeOptions.find((item) => {
      if (item.id === previousAssigneeId) return false
      return data.profiles.find((profile) => profile.id === item.id)?.is_active !== false
    })!
    data.profiles = data.profiles.map((item) => item.id === previousAssigneeId
      ? { ...item, is_active: false }
      : item)
    data.changeApplicationSummaries = []
    const reassignSpy = vi.spyOn(dataModule, 'reassignProductChangeTasks').mockResolvedValue()
    render(
      <ChangeApplicationsPanel profile={previewLeader} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: `${task.product_name} 활성 책임자 재배정` }))
    const assigneeSelect = screen.getByLabelText('새 적용 책임자')
    expect(assigneeSelect).toHaveValue('')
    expect(within(assigneeSelect).queryByRole('option', { name: task.assignee_name! })).not.toBeInTheDocument()
    fireEvent.change(assigneeSelect, { target: { value: replacement.id } })
    fireEvent.change(screen.getByLabelText('재배정 사유'), { target: { value: '퇴사자 업무 복구' } })
    fireEvent.click(screen.getByRole('button', { name: '담당자 변경' }))

    await waitFor(() => expect(reassignSpy).toHaveBeenCalledOnce())
    expect(reassignSpy.mock.calls[0].slice(1)).toEqual([[task.id], replacement.id, '퇴사자 업무 복구'])
  })

  it('sends assigned-member completion without a proxy reason', async () => {
    const data = createPreviewData()
    const completeSpy = vi.spyOn(dataModule, 'completeProductChangeTask').mockResolvedValue()
    render(
      <ChangeApplicationsPanel profile={previewMember} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: '적용 완료' })[0])
    await waitFor(() => expect(screen.getByPlaceholderText('예: 제품표준서 Rev.12 반영')).toHaveFocus())
    fireEvent.change(screen.getByPlaceholderText('예: 제품표준서 Rev.12 반영'), { target: { value: 'Rev.13 반영' } })
    fireEvent.click(screen.getByRole('button', { name: '완료 확인' }))

    await waitFor(() => expect(completeSpy).toHaveBeenCalledOnce())
    expect(completeSpy.mock.calls[0].slice(2)).toEqual(['Rev.13 반영', ''])
    expect(screen.queryByText('대리 처리 사유')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '처리 이력' })).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps a member completion in processing history until final approval and lets the assignee reopen it', async () => {
    const data = createPreviewData()
    const task = data.productChangeTasks.find(
      (item) => item.assignee_id === previewMember.id && item.status === 'pending',
    )!
    data.productChangeTasks = data.productChangeTasks.map((item) => item.id === task.id ? {
      ...item,
      status: 'completed' as const,
      completed_by: previewMember.id,
      completed_by_name: previewMember.name,
      completed_at: '2026-07-31T03:00:00.000Z',
      completion_note: '제품표준서 반영 완료',
    } : item)
    data.changeApplicationSummaries = []
    const reopenSpy = vi.spyOn(dataModule, 'reopenProductChangeTask').mockResolvedValue()

    render(
      <ChangeApplicationsPanel profile={previewMember} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('tab', { name: '처리 이력' }))
    expect(screen.getByRole('heading', { name: '최종 확인 전 처리' })).toBeInTheDocument()
    expect(screen.getByText('내 제품 처리 완료')).toBeInTheDocument()
    const targetRow = screen.getByText('제품표준서 반영 완료').closest('article')!
    fireEvent.click(within(targetRow).getByRole('button', { name: '다시 열기' }))
    await waitFor(() => expect(screen.getByLabelText('재개 사유')).toHaveFocus())
    fireEvent.change(screen.getByLabelText('재개 사유'), { target: { value: '반영 내용 재확인 필요' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '다시 열기' }))

    await waitFor(() => expect(reopenSpy).toHaveBeenCalledOnce())
    expect(reopenSpy.mock.calls[0].slice(1)).toEqual([task.id, '반영 내용 재확인 필요'])
    expect(screen.getByRole('tab', { name: /내 미적용/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('only exposes scope restoration before shared content is locked', () => {
    const data = createPreviewData()
    const task = data.productChangeTasks.find((item) => item.status === 'pending')!
    const action = data.changeActionItems.find((item) => item.id === task.action_item_id)!
    data.productChangeTasks = data.productChangeTasks.map((item) => item.id === task.id ? {
      ...item,
      status: 'cancelled' as const,
      cancel_kind: 'scope_removed' as const,
      resolution_reason: '초기 범위 조정',
    } : item)
    data.changeApplications = data.changeApplications.map((application) => application.id === action.change_application_id
      ? { ...application, content_locked_at: '2026-07-31T03:00:00.000Z' }
      : application)
    data.changeApplicationSummaries = []

    const view = render(
      <ChangeApplicationsPanel profile={previewLeader} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: '범위 복원' })).not.toBeInTheDocument()

    view.rerender(
      <ChangeApplicationsPanel
        profile={previewLeader}
        data={{
          ...data,
          changeApplications: data.changeApplications.map((application) => application.id === action.change_application_id
            ? { ...application, content_locked_at: null }
            : application),
        }}
        mutate={vi.fn(runMutation)}
        setData={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: '범위 복원' })).toBeInTheDocument()
  })

  it('moves terminal product work to final review and requires a memo for exceptions', async () => {
    const data = finalReviewData()
    const finalizeSpy = vi.spyOn(dataModule, 'finalizeChangeApplication').mockResolvedValue()
    render(
      <ChangeApplicationsPanel profile={previewLeader} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('tab', { name: /최종 확인 대기/ }))
    expect(screen.getByText('파트장 최종 확인 대기')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '변경 취소' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '변경 완료' }))

    expect(screen.getByRole('heading', { name: '공통변경을 최종 완료할까요?' })).toBeInTheDocument()
    expect(screen.getAllByText('이 제품은 변경 원료를 사용하지 않음')).toHaveLength(2)
    const finalizationDialog = screen.getByRole('dialog', { name: '공통변경을 최종 완료할까요?' })
    expect(within(finalizationDialog).getByRole('button', { name: '변경 완료' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('최종 확인 메모'), { target: { value: '해당 없음 사유를 확인함' } })
    fireEvent.click(within(finalizationDialog).getByRole('button', { name: '변경 완료' }))

    await waitFor(() => expect(finalizeSpy).toHaveBeenCalledOnce())
    expect(finalizeSpy.mock.calls[0][1]).toMatchObject({
      changeApplicationId: 'change-application-01',
      note: '해당 없음 사유를 확인함',
    })
  })

  it('searches durable history, opens detail, and lets a leader undo selected products', async () => {
    const data = completedHistoryData()
    const undoSpy = vi.spyOn(dataModule, 'undoFinalizeChangeApplication').mockResolvedValue()
    const historySpy = vi.spyOn(dataModule, 'fetchChangeApplicationHistoryPage')
    render(
      <ChangeApplicationsPanel profile={previewLeader} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('tab', { name: '완료 이력' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /CC-2026-014/ })).toBeInTheDocument())
    expect(screen.getByRole('article', { name: '완료 이력 상세' })).toHaveTextContent('예외 사유 확인 후 최종 완료')
    expect(screen.getByLabelText('완료 결과')).toBeInTheDocument()
    expect(screen.getByLabelText('이력 제품')).toBeInTheDocument()
    expect(screen.getByLabelText('이력 담당자')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('이력 종료일'), { target: { value: '2026-07-23' } })
    fireEvent.click(screen.getByRole('button', { name: '검색' }))
    await waitFor(() => expect(historySpy).toHaveBeenCalledTimes(2))
    expect(historySpy.mock.calls[1][0].to).toBe('2026-07-23')

    fireEvent.click(within(screen.getByRole('article', { name: '완료 이력 상세' })).getByRole('button', { name: '완료 취소' }))
    fireEvent.change(screen.getByLabelText('완료 취소 사유'), { target: { value: '추가 반영 필요' } })
    const reopenable = data.productChangeTasks.find((task) => task.action_item_id === 'change-action-01') as ProductChangeTask
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(reopenable.product_name) }))
    expect(screen.getByLabelText(`${reopenable.product_name} 재개 책임자`)).not.toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: '완료 취소 및 업무 재개' }))

    await waitFor(() => expect(undoSpy).toHaveBeenCalledOnce())
    expect(undoSpy.mock.calls[0][1]).toMatchObject({
      changeApplicationId: 'change-application-01',
      reason: '추가 반영 필요',
      reopen_tasks: [{ task_id: reopenable.id, assignee_id: reopenable.assignee_id }],
    })
  })

  it('scopes member history to the signed-in assignee and hides leader filters', async () => {
    const data = completedHistoryData()
    const historySpy = vi.spyOn(dataModule, 'fetchChangeApplicationHistoryPage')
    render(
      <ChangeApplicationsPanel profile={previewMember} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('tab', { name: '처리 이력' }))
    await waitFor(() => expect(historySpy).toHaveBeenCalled())
    expect(historySpy.mock.calls[0][0]).toMatchObject({ assignee_id: previewMember.id })
    expect(screen.queryByLabelText('이력 담당자')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '완료 취소' })).not.toBeInTheDocument()
  })
})
