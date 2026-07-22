import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader } from '../demoData'
import { FULLY_APPLIED_ARCHIVE_REASON } from '../domain/changeApplications/completion'
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

  it('shows the leader a durable all-products completion KPI', () => {
    const setActiveTab = vi.fn()
    const source = createPreviewData()
    const target = source.changeApplications.find((item) => item.status === 'published')!
    const data = {
      ...source,
      changeApplications: source.changeApplications.map((application) => application.id === target.id ? {
        ...application,
        archived_at: '2026-07-22T02:00:00.000Z',
        archived_by: null,
        archive_origin: 'automatic' as const,
        archive_reason: FULLY_APPLIED_ARCHIVE_REASON,
      } : application),
    }

    render(<LeaderDashboard profile={previewLeader} data={data} setActiveTab={setActiveTab} />)

    const completedKpi = screen.getByRole('button', { name: '완료된 변경1건' })
    expect(completedKpi).toBeInTheDocument()
    fireEvent.click(completedKpi)
    expect(setActiveTab).toHaveBeenCalledWith('change-applications')
  })
})
