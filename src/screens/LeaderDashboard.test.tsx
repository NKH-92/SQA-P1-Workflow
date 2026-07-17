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
    expect(screen.getByText('평균 처리일')).toBeInTheDocument()

    fireEvent.click(changeKpi)
    expect(setActiveTab).toHaveBeenCalledWith('change-applications')
  })
})
