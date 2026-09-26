import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DateQuickPicks } from './DateQuickPicks'

afterEach(cleanup)

const options = [
  { label: '7일 후', days: 7 },
  { label: '14일 후', days: 14 },
  { label: '30일 후', days: 30 },
]

describe('DateQuickPicks', () => {
  it('adds days to the base date and marks the chip that matches the current value', () => {
    const onSelect = vi.fn()
    render(
      <DateQuickPicks
        baseDate="2026-08-01"
        caption="시행일 기준"
        label="적용 기한 빠른 선택"
        onSelect={onSelect}
        options={options}
        value="2026-08-15"
      />,
    )

    const group = screen.getByRole('group', { name: '적용 기한 빠른 선택' })
    expect(group).toBeInTheDocument()
    expect(screen.getByText('시행일 기준')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^14일 후/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^7일 후/ })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: /^30일 후/ }))
    expect(onSelect).toHaveBeenCalledWith('2026-08-31')
  })

  it('crosses month and year boundaries without time-zone drift', () => {
    const onSelect = vi.fn()
    render(<DateQuickPicks baseDate="2026-12-20" label="빠른 선택" onSelect={onSelect} options={options} value="" />)
    fireEvent.click(screen.getByRole('button', { name: /^14일 후/ }))
    expect(onSelect).toHaveBeenCalledWith('2027-01-03')
  })
})
