import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MemberPresence } from '../types'
import { TeamCalendarDialog } from './TeamCalendarDialog'

vi.mock('../hooks/useBusinessToday', () => ({ useBusinessToday: () => new Date('2026-10-26T03:00:00Z') }))

afterEach(cleanup)

const presence: MemberPresence = {
  statuses: [],
  leaves: [
    { id: 'leader', profile_id: 'leader', name: '파트장', kind: 'vacation', starts_on: '2026-10-27', ends_on: '2026-10-28', note: '가족 행사 참석' },
    { id: 'trip', profile_id: 'member', name: '파트원', kind: 'trip', starts_on: '2026-10-27', ends_on: '2026-11-02', note: '오송 공장 실사' },
    { id: 'am', profile_id: 'partial', name: '반차 파트원', kind: 'vacation', starts_on: '2026-10-27', ends_on: '2026-10-27', vacation_unit: 'half', day_period: 'am', note: '' },
    { id: 'pm', profile_id: 'partial', name: '반차 파트원', kind: 'vacation', starts_on: '2026-10-27', ends_on: '2026-10-27', vacation_unit: 'quarter', day_period: 'pm', note: '병원 진료' },
  ],
}

describe('TeamCalendarDialog shared leave details', () => {
  it('keeps cells brief and shows every person, period and reason below the selected date', () => {
    render(<TeamCalendarDialog presence={presence} onClose={vi.fn()} />)
    const day = screen.getByRole('button', { name: '10월 27일, 4건' })
    expect(day).toHaveTextContent('반차 파트원 - 오전 반차')
    expect(day).toHaveTextContent('반차 파트원 - 오후 반반차')
    expect(day).toHaveTextContent('파트원 - 출장')
    expect(day).toHaveTextContent('외 1건')
    expect(screen.getByRole('table')).not.toHaveTextContent('오송 공장 실사')
    expect(screen.getByRole('region', { name: '선택한 날짜 일정' })).not.toHaveTextContent('가족 행사 참석')

    fireEvent.click(day)
    const detail = screen.getByRole('region', { name: '선택한 날짜 일정' })
    expect(within(detail).getByRole('heading')).toHaveTextContent('10월 27일')
    const rows = within(detail).getAllByRole('listitem')
    expect(rows).toHaveLength(4)
    const leader = rows.find(row => within(row).queryByText('파트장'))!
    expect(leader).toHaveTextContent('기간10월 27일~10월 28일')
    expect(leader).toHaveTextContent('사유가족 행사 참석')
    expect(detail).toHaveTextContent('오송 공장 실사')
    expect(detail).toHaveTextContent('오전 반차')
    expect(detail).toHaveTextContent('오후 반반차')
    expect(detail).toHaveTextContent('병원 진료')
    expect(detail).toHaveTextContent('등록된 사유가 없어요.')
  })

  it('updates reasons with the selected date, person filter and shared data changes', () => {
    const { rerender } = render(<TeamCalendarDialog presence={presence} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '10월 27일, 4건' }))
    fireEvent.change(screen.getByRole('combobox', { name: '일정 볼 파트원' }), { target: { value: 'member' } })
    const detail = screen.getByRole('region', { name: '선택한 날짜 일정' })
    expect(within(detail).getAllByRole('listitem')).toHaveLength(1)
    expect(detail).toHaveTextContent('오송 공장 실사')
    expect(detail).not.toHaveTextContent('가족 행사 참석')
    fireEvent.click(screen.getByRole('button', { name: '다음 달' }))
    expect(within(detail).getByRole('heading')).toHaveTextContent('11월 1일')
    expect(detail).toHaveTextContent('오송 공장 실사')
    fireEvent.click(screen.getByRole('button', { name: '11월 3일, 0건' }))
    expect(detail).toHaveTextContent('등록된 휴가·출장이 없어요.')

    fireEvent.click(screen.getByRole('button', { name: '오늘' }))
    rerender(<TeamCalendarDialog presence={{ statuses: [], leaves: [{ ...presence.leaves[1]!, starts_on: '2026-10-26', note: '변경된 출장 사유' }] }} onClose={vi.fn()} />)
    expect(detail).toHaveTextContent('변경된 출장 사유')
    expect(detail).not.toHaveTextContent('오송 공장 실사')
  })
})
