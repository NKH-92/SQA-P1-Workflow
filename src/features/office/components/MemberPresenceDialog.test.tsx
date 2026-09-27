import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { businessDateKey } from '../../../lib/businessTime'
import type { MemberPresence } from '../../../types'
import { MemberPresenceDialog } from './MemberPresenceDialog'

afterEach(cleanup)

const me = { id: 'member-01', name: '파트원 A' }
const other = { id: 'member-02', name: '파트원 B' }

function day(offset: number) {
  const date = new Date(`${businessDateKey(new Date())}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

const presence: MemberPresence = {
  statuses: [{ profile_id: me.id, name: me.name, status: 'lab', updated_at: new Date().toISOString() }],
  leaves: [{ id: 'leave-1', profile_id: other.id, name: other.name, kind: 'trip', starts_on: day(0), ends_on: day(2), note: '오송 공장 실사' }],
}

function renderDialog(people = [me], initialProfileId = me.id) {
  const handlers = {
    onSetStatus: vi.fn(async () => true),
    onAddLeave: vi.fn(async () => true),
    onDeleteLeave: vi.fn(async () => true),
  }
  render(
    <MemberPresenceDialog
      initialProfileId={initialProfileId}
      onClose={vi.fn()}
      people={people}
      presence={presence}
      {...handlers}
    />,
  )
  return handlers
}

describe('MemberPresenceDialog', () => {
  it('shows my current status and switches it with one press', async () => {
    const { onSetStatus } = renderDialog()
    const dialog = screen.getByRole('dialog', { name: '내 상태' })
    const choices = within(dialog).getByRole('group', { name: '지금 상태 고르기' })
    expect(within(choices).getByRole('button', { name: /실험실/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(choices).getByRole('button', { name: /현장/ }))
    await waitFor(() => expect(onSetStatus).toHaveBeenCalledWith(me, 'field'))
    fireEvent.click(within(choices).getByRole('button', { name: /자리에 있음/ }))
    await waitFor(() => expect(onSetStatus).toHaveBeenCalledWith(me, null))
  })

  it('registers a vacation with dates and a note, and checks the period first', async () => {
    const { onAddLeave } = renderDialog()
    const dialog = screen.getByRole('dialog', { name: '내 상태' })
    expect(within(dialog).getByText('등록한 휴가·출장이 없어요.')).toBeInTheDocument()
    const register = within(dialog).getByRole('button', { name: '등록' })
    fireEvent.change(within(dialog).getByLabelText('마지막 날'), { target: { value: day(-1) } })
    expect(register).toBeDisabled()
    expect(within(dialog).getByText('마지막 날이 시작일보다 빨라요.')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('시작일'), { target: { value: day(3) } })
    fireEvent.change(within(dialog).getByLabelText('마지막 날'), { target: { value: day(4) } })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '메모(선택)' }), { target: { value: '가족 여행' } })
    fireEvent.click(register)
    await waitFor(() => expect(onAddLeave).toHaveBeenCalledWith(me, {
      profileId: me.id,
      kind: 'vacation',
      startsOn: day(3),
      endsOn: day(4),
      note: '가족 여행',
    }))
  })

  it('lets the leader pick someone else and cancel their trip', async () => {
    const { onDeleteLeave } = renderDialog([{ id: 'leader', name: '파트장' }, other], other.id)
    const dialog = screen.getByRole('dialog', { name: '파트원 B님 상태' })
    expect(within(dialog).getByRole('combobox', { name: '누구의 상태인가요?' })).toHaveValue(other.id)
    expect(within(dialog).getByText(/오늘은 출장 기간이라/)).toBeInTheDocument()
    const leaves = within(dialog).getByRole('list', { name: '등록한 휴가·출장' })
    expect(leaves).toHaveTextContent('오송 공장 실사')
    fireEvent.click(within(leaves).getByRole('button', { name: /출장 .* 취소/ }))
    await waitFor(() => expect(onDeleteLeave).toHaveBeenCalledWith(other, 'leave-1', 'trip'))
  })
})
