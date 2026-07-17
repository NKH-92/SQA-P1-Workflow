import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../demoData'
import * as dataModule from '../data'
import { ChangeApplicationsPanel } from './ChangeApplicationsPanel'

const supabaseState = vi.hoisted(() => ({ configured: false }))

vi.mock('../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/supabase')>()
  return {
    ...actual,
    get hasSupabaseConfig() {
      return supabaseState.configured
    },
  }
})

afterEach(() => {
  supabaseState.configured = false
  cleanup()
  vi.restoreAllMocks()
})

describe('ChangeApplicationsPanel', () => {
  it('shows leader-wide progress, grouped views, and the registration workflow', () => {
    const data = createPreviewData()
    render(
      <ChangeApplicationsPanel
        profile={previewLeader}
        data={data}
        mutate={vi.fn(async () => true)}
        setData={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: '변경 적용' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '담당자별' })).toBeInTheDocument()
    expect(screen.getAllByText('CC-2026-014').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/처리 2 \/ 5제품/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: /기한 초과/ }))
    expect(screen.getByLabelText('주의 조건')).toHaveValue('overdue')
    expect(screen.getByLabelText('변경건 상태')).toHaveValue('published')
    fireEvent.change(screen.getByLabelText('목록 적용 구분'), { target: { value: 'product_standard' } })
    expect(screen.getByLabelText('목록 적용 구분')).toHaveValue('product_standard')

    fireEvent.change(screen.getByLabelText('주의 조건'), { target: { value: 'all' } })
    fireEvent.change(screen.getByLabelText('업무 상태'), { target: { value: 'all' } })
    fireEvent.change(screen.getByLabelText('목록 적용 구분'), { target: { value: 'all' } })
    fireEvent.change(screen.getByLabelText('변경건 상태'), { target: { value: 'draft' } })
    expect(screen.getAllByText('표시기재 내부 점검').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /담당자 변경/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '적용업무 등록' }))
    expect(screen.getByRole('heading', { name: '변경 적용업무 등록' })).toBeInTheDocument()
    expect(screen.getByLabelText('변경번호')).toBeInTheDocument()
    expect(screen.getByLabelText('적용 구분')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '적용제품 선택 목록' })).toBeInTheDocument()
  })

  it('starts members in their pending product queue while allowing published common changes', () => {
    const data = createPreviewData()
    render(
      <ChangeApplicationsPanel
        profile={previewMember}
        data={data}
        mutate={vi.fn(async () => true)}
        setData={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '제품별' })).toHaveClass('selected')
    expect(screen.queryByRole('button', { name: '담당자별' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '적용 완료' }).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '변경건별' }))
    expect(screen.getAllByText('원료 제조원 변경').length).toBeGreaterThan(0)
    expect(screen.queryByText('표시기재 내부 점검')).not.toBeInTheDocument()
  })

  it('keeps the application revision captured when the edit composer opened', async () => {
    const data = createPreviewData()
    const draft = data.changeApplications.find((item) => item.id === 'change-application-draft-01')!
    const saveSpy = vi.spyOn(dataModule, 'saveChangeApplication').mockResolvedValue(draft.id)
    const mutate = vi.fn(async (operation: () => Promise<void>) => {
      await operation()
      return true
    })
    const setData = vi.fn()
    const view = render(
      <ChangeApplicationsPanel
        profile={previewLeader}
        data={data}
        mutate={mutate}
        setData={setData}
      />,
    )

    fireEvent.change(screen.getByLabelText('변경건 상태'), { target: { value: 'draft' } })
    fireEvent.click(screen.getByRole('button', { name: /초안 이어쓰기/ }))
    expect(screen.getByRole('heading', { name: '변경 적용업무 수정' })).toBeInTheDocument()

    const refreshedData = {
      ...data,
      changeApplications: data.changeApplications.map((application) => application.id === draft.id
        ? { ...application, updated_at: '2026-07-17T03:00:00.000Z' }
        : application),
    }
    view.rerender(
      <ChangeApplicationsPanel
        profile={previewLeader}
        data={refreshedData}
        mutate={mutate}
        setData={setData}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }))

    await waitFor(() => expect(saveSpy).toHaveBeenCalledOnce())
    expect(saveSpy.mock.calls[0][1]).toMatchObject({
      changeApplicationId: draft.id,
      expected_updated_at: draft.updated_at,
    })
    expect(saveSpy.mock.calls[0][2]).toBe(false)
  })

  it('shows published common information without inventing zero progress for unrelated member tasks', () => {
    const data = createPreviewData()
    data.productChangeTasks = []
    render(
      <ChangeApplicationsPanel
        profile={previewMember}
        data={data}
        mutate={vi.fn(async () => true)}
        setData={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '변경건별' }))

    expect(screen.getByText('내 배정 업무 없음 · 공통정보 조회 가능')).toBeInTheDocument()
    expect(screen.getByText('내게 배정된 제품 적용업무가 없습니다.')).toBeInTheDocument()
    expect(screen.queryByText(/처리 0 \/ 0제품/)).not.toBeInTheDocument()
  })

  it('retains explicitly loaded full history after a capped parent refresh', async () => {
    supabaseState.configured = true
    const fullData = createPreviewData()
    const application = fullData.changeApplications.find((item) => item.id === 'change-application-01')!
    const actionItemIds = new Set(
      fullData.changeActionItems
        .filter((item) => item.change_application_id === application.id)
        .map((item) => item.id),
    )
    const fullHistory = fullData.productChangeTasks.filter((task) => actionItemIds.has(task.action_item_id))
    const cappedTasks = fullData.productChangeTasks.filter(
      (task) => !actionItemIds.has(task.action_item_id) || task.status === 'pending',
    )
    const cappedData = { ...fullData, productChangeTasks: cappedTasks }
    const setData = vi.fn()
    const historySpy = vi.spyOn(dataModule, 'fetchProductChangeTaskHistory').mockResolvedValue(fullHistory)

    const view = render(
      <ChangeApplicationsPanel
        profile={previewLeader}
        data={cappedData}
        mutate={vi.fn(async () => true)}
        setData={setData}
      />,
    )

    expect(screen.queryByText(/처리 0 \/ 0제품/)).not.toBeInTheDocument()
    expect(screen.queryByText(/처리 0 \/ 3제품/)).not.toBeInTheDocument()
    expect(screen.getAllByText('전체 이력을 불러온 후 정확한 진행률을 표시합니다.').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '전체 이력 불러오기' }))

    await waitFor(() => expect(historySpy).toHaveBeenCalledWith([...actionItemIds]))
    await waitFor(() => expect(screen.getByRole('button', { name: '전체 이력 확인됨' })).toBeDisabled())
    expect(screen.getAllByText(/처리 2 \/ 5제품/).length).toBeGreaterThan(0)

    const refreshedData = {
      ...cappedData,
      productChangeTasks: cappedTasks.map((task) => ({ ...task })),
    }
    view.rerender(
      <ChangeApplicationsPanel
        profile={previewLeader}
        data={refreshedData}
        mutate={vi.fn(async () => true)}
        setData={setData}
      />,
    )

    expect(screen.getByRole('button', { name: '전체 이력 확인됨' })).toBeDisabled()
    expect(screen.getAllByText(/처리 2 \/ 5제품/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(fullHistory.find((task) => task.status === 'completed')!.product_name).length).toBeGreaterThan(0)
  })

  it('does not fabricate zero progress for a member who created the change before history is loaded', async () => {
    supabaseState.configured = true
    const source = createPreviewData()
    const application = {
      ...source.changeApplications.find((item) => item.id === 'change-application-01')!,
      created_by: previewMember.id,
      profiles: { name: previewMember.name },
    }
    const data = {
      ...source,
      changeApplications: [application],
      changeActionItems: source.changeActionItems.filter(
        (item) => item.change_application_id === application.id,
      ),
      productChangeTasks: [],
    }
    vi.spyOn(dataModule, 'fetchProductChangeTaskHistory').mockResolvedValue([])

    render(
      <ChangeApplicationsPanel
        profile={previewMember}
        data={data}
        mutate={vi.fn(async () => true)}
        setData={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '변경건별' }))
    expect(screen.queryByText(/처리 0 \/ 0제품/)).not.toBeInTheDocument()
    expect(screen.getAllByText('전체 이력을 불러온 후 정확한 진행률을 표시합니다.').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '전체 이력 불러오기' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '전체 이력 확인됨' })).toBeDisabled())
    expect(screen.getAllByText(/처리 0 \/ 0제품/).length).toBeGreaterThan(0)
  })

  it('invalidates the loaded checkpoint when the application action scope changes', async () => {
    supabaseState.configured = true
    const data = createPreviewData()
    const historySpy = vi.spyOn(dataModule, 'fetchProductChangeTaskHistory').mockResolvedValue(data.productChangeTasks)
    const setData = vi.fn()
    const view = render(
      <ChangeApplicationsPanel
        profile={previewLeader}
        data={data}
        mutate={vi.fn(async () => true)}
        setData={setData}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '전체 이력 불러오기' }))
    await waitFor(() => expect(historySpy).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: '전체 이력 확인됨' })).toBeDisabled())

    const changedScope = {
      ...data,
      changeActionItems: data.changeActionItems.map((item) =>
        item.change_application_id === 'change-application-01'
          ? { ...item, id: `${item.id}-replacement` }
          : item),
      productChangeTasks: [],
    }
    view.rerender(
      <ChangeApplicationsPanel
        profile={previewLeader}
        data={changedScope}
        mutate={vi.fn(async () => true)}
        setData={setData}
      />,
    )

    expect(screen.getByRole('button', { name: '전체 이력 불러오기' })).toBeEnabled()
    expect(screen.queryByText(/처리 0 \/ 0제품/)).not.toBeInTheDocument()
  })
})
