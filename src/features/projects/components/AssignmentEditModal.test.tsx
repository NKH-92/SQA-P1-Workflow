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

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">배정 편집 열기</button>
      {open && (
        <AssignmentEditModal
          data={data}
          memberOptions={memberOptions}
          onClose={() => setOpen(false)}
          onSave={vi.fn()}
          onToggle={vi.fn()}
          projectName="안정성 프로젝트"
          selectedIds={[memberOptions[0]!.id]}
        />
      )}
    </>
  )
}

describe('AssignmentEditModal accessibility contract', () => {
  it('names the dialog, traps focus, locks scrolling, and returns focus after Escape', async () => {
    const user = userEvent.setup()
    render(<AssignmentEditHarness />)
    const trigger = screen.getByRole('button', { name: '배정 편집 열기' })

    await user.click(trigger)

    const dialog = screen.getByRole('dialog', { name: '안정성 프로젝트' })
    const closeButton = within(dialog).getByRole('button', { name: '배정 편집 닫기' })
    const saveButton = within(dialog).getByRole('button', { name: /배정 저장/ })
    expect(document.body.style.overflow).toBe('hidden')
    await waitFor(() => expect(closeButton).toHaveFocus())

    await user.tab({ shift: true })
    expect(saveButton).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '안정성 프로젝트' })).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
    expect(trigger).toHaveFocus()
  })
})
