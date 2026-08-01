import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader } from '../demoData'
import { LeaderDashboard } from './LeaderDashboard'

afterEach(cleanup)

describe('LeaderDashboard', () => {
  it('links the pending change KPI without removing the monthly review metric', () => {
    const setActiveTab = vi.fn()

    render(
      <LeaderDashboard
        profile={previewLeader}
        data={createPreviewData()}
        setActiveTab={setActiveTab}
      />,
    )

    const changeKpi = screen.getByRole('button', { name: '미적용 변경업무3건' })
    expect(changeKpi).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '월간 검토 처리' })).toBeInTheDocument()
    expect(screen.getByText('기간 내 현재 대기')).toBeInTheDocument()

    fireEvent.click(changeKpi)
    expect(setActiveTab).toHaveBeenCalledWith('change-applications')
  })

  it('separates in-progress work from applications awaiting final review', () => {
    const setActiveTab = vi.fn()
    const source = createPreviewData()
    const target = source.changeApplications.find((item) => item.status === 'published')!
    const targetActionIds = new Set(source.changeActionItems
      .filter((item) => item.change_application_id === target.id)
      .map((item) => item.id))
    const data = {
      ...source,
      productChangeTasks: source.productChangeTasks.map((task) => targetActionIds.has(task.action_item_id)
        ? { ...task, status: 'completed' as const }
        : task),
      changeApplicationSummaries: [{
        change_application_id: target.id,
        workflow_status: 'final_review_ready' as const,
        total_count: 12,
        pending_count: 0,
        completed_count: 12,
        not_applicable_count: 0,
        scope_removed_count: 0,
        unresolved_cancelled_count: 0,
        unassigned_count: 0,
        processed_count: 12,
        percent: 100,
        can_finalize: true,
      }],
    }

    render(<LeaderDashboard profile={previewLeader} data={data} setActiveTab={setActiveTab} />)

    expect(screen.getByRole('button', { name: '미적용 변경업무0건' })).toBeInTheDocument()
    const finalReviewKpi = screen.getByRole('button', { name: '최종 확인 대기1건' })
    fireEvent.click(finalReviewKpi)
    expect(setActiveTab).toHaveBeenCalledWith('change-applications', target.id)
  })
})
