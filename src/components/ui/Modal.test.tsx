import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

afterEach(cleanup)

/** Mirrors the real-world `{dialog && <Modal .../>}` pattern (e.g. `ChangeActionModal`)
 * where the caller unmounts the Modal outright on close instead of toggling `open`. */
function ConditionallyMountedHarness({
  onSubmitSuccess,
}: {
  onSubmitSuccess?: () => void
}) {
  const [isOpen, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(true)} type="button">
        트리거
      </button>
      {isOpen && (
        <Modal open onClose={() => setOpen(false)} title="확인" closeLabel="닫기">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              onSubmitSuccess?.()
              setOpen(false)
            }}
          >
            <button type="submit">제출</button>
          </form>
        </Modal>
      )}
    </div>
  )
}

/** Mirrors call sites that keep the Modal mounted and toggle the `open` prop. */
function ToggledOpenHarness() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(true)} type="button">
        트리거
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="확인" closeLabel="닫기">
        <p>내용</p>
      </Modal>
    </div>
  )
}

function NestedModalHarness() {
  const [parentOpen, setParentOpen] = useState(false)
  const [childOpen, setChildOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setParentOpen(true)} type="button">
        상위 트리거
      </button>
      <Modal open={parentOpen} onClose={() => setParentOpen(false)} title="상위 모달" closeLabel="상위 닫기">
        <button onClick={() => setChildOpen(true)} type="button">
          하위 트리거
        </button>
        {childOpen && (
          <Modal open onClose={() => setChildOpen(false)} title="하위 모달" closeLabel="하위 닫기">
            <p>하위 내용</p>
          </Modal>
        )}
      </Modal>
    </div>
  )
}

function ReturnFocusRefHarness() {
  const [open, setOpen] = useState(false)
  const returnTarget = useRef<HTMLButtonElement>(null)
  return (
    <div>
      <button onClick={() => setOpen(true)} type="button">
        트리거
      </button>
      <button ref={returnTarget} type="button">
        명시적 복귀 대상
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="확인" closeLabel="닫기" returnFocusRef={returnTarget}>
          <p>내용</p>
        </Modal>
      )}
    </div>
  )
}

describe('Modal focus return', () => {
  it('returns focus to the trigger after the close button is clicked (open toggled, not unmounted)', async () => {
    const user = userEvent.setup()
    render(<ToggledOpenHarness />)

    const trigger = screen.getByRole('button', { name: '트리거' })
    await user.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('returns focus to the trigger when the caller unmounts the Modal on close', async () => {
    const user = userEvent.setup()
    render(<ConditionallyMountedHarness />)

    const trigger = screen.getByRole('button', { name: '트리거' })
    await user.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('returns focus to the trigger after Escape closes the modal', async () => {
    const user = userEvent.setup()
    render(<ConditionallyMountedHarness />)

    const trigger = screen.getByRole('button', { name: '트리거' })
    await user.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('returns focus to the trigger after a backdrop click closes the modal', async () => {
    const user = userEvent.setup()
    const { container } = render(<ConditionallyMountedHarness />)

    const trigger = screen.getByRole('button', { name: '트리거' })
    await user.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    const backdrop = container.querySelector('.modal-backdrop')
    expect(backdrop).toBeTruthy()
    fireEvent.mouseDown(backdrop as Element)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('returns focus to the trigger after a successful submit unmounts the parent-owned modal', async () => {
    const user = userEvent.setup()
    const onSubmitSuccess = vi.fn()
    render(<ConditionallyMountedHarness onSubmitSuccess={onSubmitSuccess} />)

    const trigger = screen.getByRole('button', { name: '트리거' })
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: '제출' }))

    expect(onSubmitSuccess).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('prefers an explicit returnFocusRef over the captured trigger', async () => {
    const user = userEvent.setup()
    render(<ReturnFocusRefHarness />)

    await user.click(screen.getByRole('button', { name: '트리거' }))
    await user.click(screen.getByRole('button', { name: '닫기' }))

    expect(screen.getByRole('button', { name: '명시적 복귀 대상' })).toHaveFocus()
  })

  it('does not throw and does not crash when the trigger has been removed from the DOM before close', async () => {
    const user = userEvent.setup()

    function RemovableTriggerHarness() {
      const [showTrigger, setShowTrigger] = useState(true)
      const [open, setOpen] = useState(false)
      return (
        <div>
          {showTrigger && (
            <button
              onClick={() => {
                setOpen(true)
              }}
              type="button"
            >
              사라지는 트리거
            </button>
          )}
          <button onClick={() => setShowTrigger(false)} type="button">
            트리거 제거
          </button>
          {open && (
            <Modal open onClose={() => setOpen(false)} title="확인" closeLabel="닫기">
              <p>내용</p>
            </Modal>
          )}
        </div>
      )
    }

    render(<RemovableTriggerHarness />)
    await user.click(screen.getByRole('button', { name: '사라지는 트리거' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Remove the trigger from the DOM while the modal is still open.
    fireEvent.click(screen.getByRole('button', { name: '트리거 제거' }))
    expect(screen.queryByRole('button', { name: '사라지는 트리거' })).not.toBeInTheDocument()

    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    }).not.toThrow()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('restores focus into the parent modal when only the nested child modal is closed', async () => {
    const user = userEvent.setup()
    render(<NestedModalHarness />)

    await user.click(screen.getByRole('button', { name: '상위 트리거' }))
    const childTrigger = screen.getByRole('button', { name: '하위 트리거' })
    await user.click(childTrigger)

    const dialogs = screen.getAllByRole('dialog')
    expect(dialogs).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: '하위 닫기' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(childTrigger).toHaveFocus()
  })

  it('closes only the topmost nested modal on Escape and leaves the parent open', async () => {
    const user = userEvent.setup()
    render(<NestedModalHarness />)

    await user.click(screen.getByRole('button', { name: '상위 트리거' }))
    await user.click(screen.getByRole('button', { name: '하위 트리거' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(2)

    await user.keyboard('{Escape}')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: '상위 모달' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '하위 모달' })).not.toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('restores body overflow after unmount', async () => {
    const user = userEvent.setup()
    render(<ConditionallyMountedHarness />)

    await user.click(screen.getByRole('button', { name: '트리거' }))
    expect(document.body.style.overflow).toBe('hidden')

    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps Tab focus trap behavior intact', async () => {
    const user = userEvent.setup()

    function TrapHarness() {
      const [open, setOpen] = useState(false)
      return (
        <div>
          <button onClick={() => setOpen(true)} type="button">
            트리거
          </button>
          {open && (
            <Modal open onClose={() => setOpen(false)} title="확인" closeLabel="닫기">
              <button type="button">첫 번째</button>
              <button type="button">두 번째</button>
            </Modal>
          )}
        </div>
      )
    }

    render(<TrapHarness />)
    await user.click(screen.getByRole('button', { name: '트리거' }))

    const closeButton = screen.getByRole('button', { name: '닫기' })
    const first = screen.getByRole('button', { name: '첫 번째' })
    const second = screen.getByRole('button', { name: '두 번째' })

    expect(closeButton).toHaveFocus()
    await user.tab()
    expect(first).toHaveFocus()
    await user.tab()
    expect(second).toHaveFocus()
    await user.tab()
    expect(closeButton).toHaveFocus()
    await user.tab({ shift: true })
    expect(second).toHaveFocus()
  })

  it('is safe under React StrictMode double-invoked effects', async () => {
    const user = userEvent.setup()

    function StrictHarness() {
      const [open, setOpen] = useState(false)
      return (
        <div>
          <button onClick={() => setOpen(true)} type="button">
            트리거
          </button>
          {open && (
            <Modal open onClose={() => setOpen(false)} title="확인" closeLabel="닫기">
              <p>내용</p>
            </Modal>
          )}
        </div>
      )
    }

    render(
      <StrictMode>
        <StrictHarness />
      </StrictMode>,
    )

    const trigger = screen.getByRole('button', { name: '트리거' })
    await user.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
