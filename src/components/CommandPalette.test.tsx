import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../demoData'
import { CommandPalette } from './CommandPalette'

describe('CommandPalette review statistics navigation', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows review statistics to leaders', () => {
    render(
      <CommandPalette
        data={createPreviewData()}
        leaderMode
        onClose={vi.fn()}
        open
        profile={previewLeader}
        setActiveTab={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: '빠른 이동' })
    expect(within(dialog).getByRole('button', { name: /검토 통계\s*review-stats 화면으로 이동/ })).toBeInTheDocument()
  })

  it('does not expose review statistics to members', () => {
    render(
      <CommandPalette
        data={createPreviewData()}
        leaderMode={false}
        onClose={vi.fn()}
        open
        profile={previewMember}
        setActiveTab={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: '빠른 이동' })
    expect(within(dialog).queryByRole('button', { name: /검토 통계/ })).not.toBeInTheDocument()
  })
})
