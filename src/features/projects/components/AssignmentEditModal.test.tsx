import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData } from '../../../demoData'
import { AssignmentEditModal } from './AssignmentEditModal'

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

function AssignmentEditHarness() {
  const data = createPreviewData()
  const memberOptions = data.profiles.slice(0, 2)
  const [open, setOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState([memberOptions[0]!.id])

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">담당자 변경 열기</button>
      {open && (
        <AssignmentEditModal
          data={data}
          memberOptions={memberOptions}
          onClose={() => setOpen(false)}
          onSave={vi.fn()}
          onToggle={(memberId) =>
            setSelectedIds((current) =>
              current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId],
            )
          }
          projectName="안정성 프로젝트"
          selectedIds={selectedIds}
        />
      )}
    </>
  )
}

describe('AssignmentEditModal accessibility contract', () => {
  it('names the dialog, focuses the first choice, traps focus, locks scrolling, and returns focus after Escape', async () => {
    const user = userEvent.setup()
    render(<AssignmentEditHarness />)
    const trigger = screen.getByRole('button', { name: '담당자 변경 열기' })

    await user.click(trigger)

    const dialog = screen.getByRole('dialog', { name: '안정성 프로젝트' })
    const closeButton = within(dialog).getByRole('button', { name: '담당자 변경 닫기' })
    const saveButton = within(dialog).getByRole('button', { name: /담당자 저장하기/ })
    const [firstChoice] = within(dialog).getAllByRole('button', { pressed: true })
    expect(document.body.style.overflow).toBe('hidden')
    // 창을 열면 닫기(X)가 아니라 첫 선택지에 포커스가 간다(공용 Modal 규칙).
    await waitFor(() => expect(firstChoice).toHaveFocus())

    await user.tab({ shift: true })
    expect(closeButton).toHaveFocus()
    // 첫 요소에서 Shift+Tab은 마지막 요소(저장)로 돈다.
    await user.tab({ shift: true })
    expect(saveButton).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '안정성 프로젝트' })).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
    expect(trigger).toHaveFocus()
  })

  it('asks before discarding a changed selection', async () => {
    const user = userEvent.setup()
    render(<AssignmentEditHarness />)

    await user.click(screen.getByRole('button', { name: '담당자 변경 열기' }))
    const dialog = screen.getByRole('dialog', { name: '안정성 프로젝트' })
    const [unselected] = within(dialog).getAllByRole('button', { pressed: false })
    await user.click(unselected!)
    expect(within(dialog).getByRole('button', { name: /담당자 저장하기 · 2명/ })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '닫기' }))
    expect(within(dialog).getByText(/작성 중인 내용이 있어요/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '버리고 닫기' }))
    expect(screen.queryByRole('dialog', { name: '안정성 프로젝트' })).not.toBeInTheDocument()
  })
})
