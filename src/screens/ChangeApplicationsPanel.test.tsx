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

/** 같은 제품에 공통변경을 하나 더 배포해, 한 제품에 적용 업무가 두 건인 상황을 만든다. */
function twoTasksForOneProductData(): { data: AppData; tasks: ProductChangeTask[] } {
  const data = createPreviewData()
  const ownTask = data.productChangeTasks.find(
    (task) => task.assignee_id === previewMember.id && task.status === 'pending' && task.action_item_id === 'change-action-01',
  )!
  const baseApplication = data.changeApplications.find((item) => item.id === 'change-application-01')!
  const baseAction = data.changeActionItems.find((item) => item.id === 'change-action-01')!
  data.changeApplications = [...data.changeApplications, {
    ...baseApplication,
    id: 'change-application-02',
    change_number: 'CC-2026-015',
    title: '포장 재질 변경',
    content_locked_at: null,
  }]
  data.changeActionItems = [...data.changeActionItems, {
    ...baseAction,
    id: 'change-action-02',
    change_application_id: 'change-application-02',
    content: '포장 재질 정보를 제품표준서에 반영합니다.',
  }]
  const secondTask: ProductChangeTask = { ...ownTask, id: 'product-change-task-extra', action_item_id: 'change-action-02' }
  data.productChangeTasks = [...data.productChangeTasks, secondTask]
  data.changeApplicationSummaries = []
  return { data, tasks: [ownTask, secondTask] }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  // 보기 상태(useViewState)와 임시저장이 다음 테스트로 새지 않게 비운다.
  window.sessionStorage.clear()
  window.localStorage.clear()
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
    expect(screen.getByRole('button', { name: '공통변경별' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: '변경 적용 검색' })).toHaveAttribute('placeholder', '공통변경·제품·담당자 검색')

    leaderView.unmount()
    render(
      <ChangeApplicationsPanel profile={previewMember} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    expect(screen.getByRole('tab', { name: /내 미적용/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '처리 이력' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '공통변경 등록' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '담당자별' })).not.toBeInTheDocument()
  })

  it('uses a three-step composer and blocks publish until every product has an active owner', async () => {
    const data = createPreviewData()
    const product = data.changeProductScope[0]
    render(
      <ChangeApplicationsPanel profile={previewLeader} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: '공통변경 등록' }))
    expect(screen.getByRole('dialog', { name: '공통변경 등록' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '공통변경 등록 단계' })).toBeInTheDocument()
    expect(screen.getAllByText('변경 정보').length).toBeGreaterThan(0)
    expect(screen.queryByRole('list', { name: '적용 제품 선택 목록' })).not.toBeInTheDocument()

    // 비어 있는 채로 다음을 누르면 단계는 그대로이고, 빠진 칸마다 이유를 보여준다.
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))
    expect(screen.getByLabelText('변경 제목')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('변경 제목을 입력해 주세요.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '양식 받기' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('변경번호'), { target: { value: 'CC-2026-099' } })
    fireEvent.change(screen.getByLabelText('변경 제목'), { target: { value: '시험 방법 공통 개정' } })
    fireEvent.change(screen.getByLabelText('변경 요약'), { target: { value: '시험 방법 변경을 모든 대상 제품에 반영합니다.' } })
    fireEvent.change(screen.getByLabelText('시행일'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('적용 내용'), { target: { value: '제품표준서 시험 방법을 개정합니다.' } })
    // 적용 기한은 시행일 기준 빠른 선택으로 채운다.
    fireEvent.click(screen.getByRole('button', { name: /^14일 후/ }))
    expect(screen.getByLabelText('적용 기한')).toHaveValue('2026-09-15')
    expect(screen.queryByText('변경 제목을 입력해 주세요.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))

    expect(screen.getByRole('link', { name: '양식 받기' })).toHaveAttribute('href', '/change-application-products-template.xlsx')
    // 제품명 검색에서 Enter를 눌러도 단계가 넘어가지 않는다(D-3).
    const productSearch = screen.getByRole('textbox', { name: '제품명 검색' })
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    productSearch.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(true)
    expect(screen.getByRole('link', { name: '양식 받기' })).toBeInTheDocument()
    const file = new File([`제품명\n${product.product_name}`], '적용제품.csv', { type: 'text/csv' })
    fireEvent.change(screen.getByLabelText('적용 제품 Excel 파일 선택'), { target: { files: [file] } })
    expect(await screen.findByRole('region', { name: 'Excel 제품 가져오기 검토' })).toBeInTheDocument()
    expect(screen.getByText('적용제품.csv')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '선택 제품에 반영' }))

    const scope = screen.getByRole('list', { name: '적용 제품 선택 목록' })
    expect(within(scope).getByRole('button', { name: new RegExp(product.product_name) })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(`${product.product_name} 적용 담당자`)).not.toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))

    expect(screen.getAllByText('최종 검토·배포')).toHaveLength(2)
    expect(screen.getByText('모든 제품에 담당자를 정했어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1개 제품에 배포하기' })).toBeEnabled()
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
    expect(screen.getByRole('button', { name: `${ownTask.product_name} 범위에서 빼기` })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `${ownTask.product_name} 업무 취소` })).not.toBeInTheDocument()
  })

  it('shows member work as a product list with full change details', () => {
    const data = createPreviewData()
    const ownContexts = data.productChangeTasks.filter(
      (task) => task.assignee_id === previewMember.id && task.status === 'pending',
    )
    render(
      <ChangeApplicationsPanel profile={previewMember} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    const productList = screen.getByRole('navigation', { name: '적용대상 제품 목록' })
    expect(within(productList).getAllByRole('button')).toHaveLength(new Set(ownContexts.map((task) => task.product_id)).size)
    expect(screen.queryByRole('button', { name: '공통변경별' })).not.toBeInTheDocument()

    const firstTask = ownContexts[0]
    const action = data.changeActionItems.find((item) => item.id === firstTask.action_item_id)!
    const application = data.changeApplications.find((item) => item.id === action.change_application_id)!
    const detail = screen.getByRole('region', { name: `${firstTask.product_name} 변경관리 내용` })
    expect(detail).toHaveTextContent(application.title)
    expect(detail).toHaveTextContent(application.summary)
    expect(detail).toHaveTextContent(action.content)
    expect(within(detail).getByRole('button', { name: '적용 완료' })).toBeInTheDocument()
  })

  it('confirms final-review readiness after the member finishes their last product', () => {
    render(
      <ChangeApplicationsPanel
        profile={previewMember}
        data={finalReviewData()}
        mutate={vi.fn(runMutation)}
        setData={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('파트장 최종 확인 대기')
    expect(screen.getByText('내 제품 처리를 모두 마쳤어요')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '적용대상 제품 목록' })).not.toBeInTheDocument()
  })

  it('reports final-review readiness instead of a search miss when the last task is done under a saved search', () => {
    // 검색어를 넣은 채 마지막 업무를 처리했다. 목록이 빈 까닭은 검색이 아니라 남은 업무가 없어서다.
    window.sessionStorage.setItem('sqa.view.changes.member.query', JSON.stringify('원료'))
    render(
      <ChangeApplicationsPanel
        profile={previewMember}
        data={finalReviewData()}
        mutate={vi.fn(runMutation)}
        setData={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('파트장 최종 확인 대기')
    expect(screen.getByText('내 제품 처리를 모두 마쳤어요')).toBeInTheDocument()
    expect(screen.queryByText('조건에 맞는 적용 업무가 없어요')).not.toBeInTheDocument()
  })

  it('routes the leader pending-task action through scope removal', async () => {
    const data = createPreviewData()
    const task = data.productChangeTasks.find((item) => item.status === 'pending')!
    const removeScopeSpy = vi.spyOn(dataModule, 'removeProductChangeScope').mockResolvedValue()
    render(
      <ChangeApplicationsPanel profile={previewLeader} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: `${task.product_name} 범위에서 빼기` }))
    expect(screen.getByRole('heading', { name: '이 제품을 적용 범위에서 뺄까요?' })).toBeInTheDocument()
    // 사유 없이 누르면 칸 아래에 이유를 보여주고 저장하지 않는다.
    fireEvent.click(screen.getByRole('button', { name: '범위에서 빼기' }))
    expect(screen.getByText('범위에서 빼는 이유를 적어 주세요.')).toBeInTheDocument()
    expect(removeScopeSpy).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('범위에서 빼는 이유'), { target: { value: '변경 대상 아님' } })
    fireEvent.click(screen.getByRole('button', { name: '범위에서 빼기' }))

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

    fireEvent.click(screen.getByRole('button', { name: `${task.product_name} 담당자 다시 배정` }))
    expect(screen.getByRole('heading', { name: '이 업무의 담당자를 바꿀까요?' })).toBeInTheDocument()
    const assigneeSelect = screen.getByLabelText('새 담당자')
    expect(assigneeSelect).toHaveValue('')
    expect(within(assigneeSelect).queryByRole('option', { name: task.assignee_name! })).not.toBeInTheDocument()
    fireEvent.change(assigneeSelect, { target: { value: replacement.id } })
    fireEvent.change(screen.getByLabelText('담당자를 바꾸는 이유'), { target: { value: '퇴사자 업무 복구' } })
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
    expect(screen.getByRole('heading', { name: '이 제품에 변경을 적용했나요?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '적용 완료하기' }))

    await waitFor(() => expect(completeSpy).toHaveBeenCalledOnce())
    expect(completeSpy.mock.calls[0].slice(2)).toEqual(['Rev.13 반영', ''])
    expect(screen.queryByText('대리 처리 사유')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /내 미적용/ })).toHaveAttribute('aria-selected', 'true')
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
    fireEvent.click(within(targetRow).getByRole('button', { name: `${task.product_name} 다시 열기` }))
    await waitFor(() => expect(screen.getByLabelText('다시 여는 이유')).toHaveFocus())
    fireEvent.change(screen.getByLabelText('다시 여는 이유'), { target: { value: '반영 내용 재확인 필요' } })
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
    expect(screen.queryByRole('button', { name: `${task.product_name} 범위에 다시 넣기` })).not.toBeInTheDocument()

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
    expect(screen.getByRole('button', { name: `${task.product_name} 범위에 다시 넣기` })).toBeInTheDocument()
  })

  it('moves terminal product work to final review and requires a memo for exceptions', async () => {
    const data = finalReviewData()
    const finalizeSpy = vi.spyOn(dataModule, 'finalizeChangeApplication').mockResolvedValue()
    render(
      <ChangeApplicationsPanel profile={previewLeader} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('tab', { name: /최종 확인 대기/ }))
    expect(screen.getByText('파트장 최종 확인 대기')).toBeInTheDocument()
    // 공통변경 취소처럼 드물고 되돌리기 어려운 행동은 더보기 메뉴에 있다.
    fireEvent.click(screen.getByRole('button', { name: 'CC-2026-014 더보기' }))
    expect(screen.getByRole('menuitem', { name: '공통변경 취소' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: '공통변경 완료하기' }))

    expect(screen.getByRole('heading', { name: '공통변경을 최종 완료할까요?' })).toBeInTheDocument()
    expect(screen.getAllByText('이 제품은 변경 원료를 사용하지 않음')).toHaveLength(2)
    const finalizationDialog = screen.getByRole('dialog', { name: '공통변경을 최종 완료할까요?' })
    // 예외가 있으면 메모가 필요하다. 비어 있으면 칸 아래에 이유를 보여주고 완료하지 않는다.
    fireEvent.click(within(finalizationDialog).getByRole('button', { name: '공통변경 완료하기' }))
    expect(within(finalizationDialog).getByText('해당 없음이나 범위 제외가 있으면 확인한 내용을 적어 주세요.')).toBeInTheDocument()
    expect(finalizeSpy).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('최종 확인 메모'), { target: { value: '해당 없음 사유를 확인함' } })
    fireEvent.click(within(finalizationDialog).getByRole('button', { name: '공통변경 완료하기' }))

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
    expect(screen.getByLabelText(`${reopenable.product_name} 담당자`)).not.toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: '완료 취소하고 다시 열기' }))

    await waitFor(() => expect(undoSpy).toHaveBeenCalledOnce())
    expect(undoSpy.mock.calls[0][1]).toMatchObject({
      changeApplicationId: 'change-application-01',
      reason: '추가 반영 필요',
      reopen_tasks: [{ task_id: reopenable.id, assignee_id: reopenable.assignee_id }],
    })
  })

  it('opens a completed deep link through server history search before clearing navigation', async () => {
    const data = completedHistoryData()
    const onApplied = vi.fn()

    render(
      <ChangeApplicationsPanel
        profile={previewLeader}
        data={data}
        mutate={vi.fn(runMutation)}
        setData={vi.fn()}
        initialSelectedId="change-application-01"
        onInitialSelectionApplied={onApplied}
      />,
    )

    await waitFor(() => expect(screen.getByRole('tab', { name: '완료 이력' })).toHaveAttribute('aria-selected', 'true'))
    await waitFor(() => expect(screen.getByLabelText('완료 이력 검색')).toHaveValue('CC-2026-014'))
    await waitFor(() => expect(screen.getByRole('article', { name: '완료 이력 상세' })).toHaveTextContent('예외 사유 확인 후 최종 완료'))
    expect(onApplied).toHaveBeenCalledOnce()
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

  it('filters the task list from the summary cards and shows how to clear the filter', () => {
    const data = createPreviewData()
    render(
      <ChangeApplicationsPanel profile={previewLeader} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: '제품별' }))
    const unassignedCard = screen.getByRole('button', { name: /^담당자 없음/ })
    expect(unassignedCard).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(unassignedCard)

    expect(unassignedCard).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('담당자 없음 업무만 보고 있어요')).toBeInTheDocument()
    const published = data.productChangeTasks.filter((task) => task.action_item_id === 'change-action-01' && task.status === 'pending')
    const unassigned = published.filter((task) => !task.assignee_id)
    const assigned = published.filter((task) => task.assignee_id)
    expect(unassigned.length).toBeGreaterThan(0)
    for (const task of unassigned) expect(screen.getAllByText(task.product_name).length).toBeGreaterThan(0)
    expect(screen.queryByText(assigned[0].product_name)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '필터 해제' }))
    expect(unassignedCard).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByText(assigned[0].product_name).length).toBeGreaterThan(0)
  })

  it('keeps the search and view when switching tabs and after coming back to the screen', () => {
    const data = createPreviewData()
    const view = render(
      <ChangeApplicationsPanel profile={previewLeader} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: '담당자별' }))
    fireEvent.change(screen.getByRole('textbox', { name: '변경 적용 검색' }), { target: { value: '원료' } })
    fireEvent.click(screen.getByRole('tab', { name: /최종 확인 대기/ }))
    fireEvent.click(screen.getByRole('tab', { name: '진행 중' }))
    expect(screen.getByRole('textbox', { name: '변경 적용 검색' })).toHaveValue('원료')
    expect(screen.getByRole('button', { name: '담당자별' })).toHaveAttribute('aria-pressed', 'true')

    view.unmount()
    render(
      <ChangeApplicationsPanel profile={previewLeader} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )
    expect(screen.getByRole('textbox', { name: '변경 적용 검색' })).toHaveValue('원료')
    expect(screen.getByRole('button', { name: '담당자별' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('reassigns several selected tasks at once from the product view', async () => {
    const data = createPreviewData()
    const reassignSpy = vi.spyOn(dataModule, 'reassignProductChangeTasks').mockResolvedValue()
    const pending = data.productChangeTasks
      .filter((task) => task.action_item_id === 'change-action-01' && task.status === 'pending')
      .slice(0, 2)
    const replacement = data.changeAssigneeOptions.find((item) => item.role === 'member')!
    render(
      <ChangeApplicationsPanel profile={previewLeader} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: '제품별' }))
    for (const task of pending) {
      fireEvent.click(screen.getByRole('checkbox', { name: `${task.product_name} · CC-2026-014 선택` }))
    }
    expect(screen.getByText('2건 선택')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '선택한 적용 업무 담당자 변경' }))
    expect(screen.getByRole('heading', { name: '선택한 적용 업무 2건의 담당자를 바꿀까요?' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('새 담당자'), { target: { value: replacement.id } })
    fireEvent.change(screen.getByLabelText('담당자를 바꾸는 이유'), { target: { value: '담당 재조정' } })
    fireEvent.click(screen.getByRole('button', { name: '담당자 변경' }))

    await waitFor(() => expect(reassignSpy).toHaveBeenCalledOnce())
    expect(reassignSpy.mock.calls[0].slice(1)).toEqual([pending.map((task) => task.id), replacement.id, '담당 재조정'])
  })

  it('lets a member complete every task of one product with a single memo', async () => {
    const { data, tasks } = twoTasksForOneProductData()
    const completeSpy = vi.spyOn(dataModule, 'completeProductChangeTask').mockResolvedValue()
    render(
      <ChangeApplicationsPanel profile={previewMember} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    const productList = screen.getByRole('navigation', { name: '적용대상 제품 목록' })
    fireEvent.click(within(productList).getByRole('button', { name: new RegExp(tasks[0].product_name) }))
    const detail = screen.getByRole('region', { name: `${tasks[0].product_name} 변경관리 내용` })
    fireEvent.click(within(detail).getByRole('button', { name: '이 제품 모두 적용 완료' }))
    expect(screen.getByRole('heading', { name: '이 제품의 적용 업무 2건을 모두 완료할까요?' })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('예: 제품표준서 Rev.12 반영'), { target: { value: '두 건 모두 반영' } })
    fireEvent.click(screen.getByRole('button', { name: '모두 적용 완료하기' }))

    await waitFor(() => expect(completeSpy).toHaveBeenCalledTimes(2))
    expect(completeSpy.mock.calls.map((call) => call.slice(2))).toEqual([
      ['두 건 모두 반영', ''],
      ['두 건 모두 반영', ''],
    ])
    expect(completeSpy.mock.calls.map((call) => call[1]).sort()).toEqual(tasks.map((task) => task.id).sort())
  })

  it('keeps a title-only draft on this device, guards unsaved typing, and restores it on reopen', () => {
    const data = createPreviewData()
    render(
      <ChangeApplicationsPanel profile={previewLeader} data={data} mutate={vi.fn(runMutation)} setData={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: '공통변경 등록' }))
    fireEvent.click(screen.getByRole('button', { name: '임시저장' }))
    expect(screen.getByText('제목을 입력하면 임시저장할 수 있어요.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('변경 제목'), { target: { value: '제목만 쓴 공통변경' } })
    // 저장하지 않은 입력이 있으면 닫기 전에 한 번 묻는다.
    fireEvent.click(screen.getByRole('button', { name: '공통변경 등록 닫기' }))
    expect(screen.getByText('작성 중인 내용이 있어요. 닫으면 입력한 내용이 사라져요.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '계속 쓰기' }))

    fireEvent.click(screen.getByRole('button', { name: '임시저장' }))
    expect(screen.getByText(/이 기기에 임시저장했어요/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '공통변경 등록 닫기' }))
    expect(screen.queryByRole('dialog', { name: '공통변경 등록' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '공통변경 등록' }))
    expect(screen.getByLabelText('변경 제목')).toHaveValue('제목만 쓴 공통변경')
    expect(screen.getByText(/이 기기에 임시저장한 내용을 불러왔어요/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '새로 쓰기' }))
    expect(screen.getByLabelText('변경 제목')).toHaveValue('')
  })
})
