import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCallback, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../demoData'
import { composerIntentStorageKey } from '../lib/navigation'
import type { Profile } from '../types'
import { CommandPalette } from './CommandPalette'

function CommandPaletteHarness() {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">빠른 이동 열기</button>
      <CommandPalette
        data={createPreviewData()}
        leaderMode
        onClose={close}
        open={open}
        profile={previewLeader}
        setActiveTab={vi.fn()}
      />
    </>
  )
}

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
    expect(within(dialog).getByRole('button', { name: /검토 통계\s*검토 통계 화면으로 이동/ })).toBeInTheDocument()
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

  it.each([
    { profile: previewLeader, leaderMode: true },
    { profile: previewMember, leaderMode: false },
  ])('shows announcements to $profile.role users', ({ profile, leaderMode }) => {
    render(
      <CommandPalette
        data={createPreviewData()}
        leaderMode={leaderMode}
        onClose={vi.fn()}
        open
        profile={profile}
        setActiveTab={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: '빠른 이동' })
    expect(within(dialog).getByRole('button', { name: /공지\s*공지 화면으로 이동/ })).toBeInTheDocument()
  })

  it('preserves the complete leader navigation order and palette-specific product label', () => {
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
    const navigationGroup = dialog.querySelector('.cmd-body > div:first-child')
    expect([...(navigationGroup?.querySelectorAll('.cmd-item-title') ?? [])].map((item) => item.textContent)).toEqual([
      '홈',
      '공지',
      '검토요청',
      '검토 통계',
      '변경 적용',
      '프로젝트',
      '파트원',
      '활동 로그',
      '제품',
      '업무 카테고리',
      '계정 관리',
    ])
  })

  it('preserves the complete member navigation order and member-specific labels', () => {
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
    const navigationGroup = dialog.querySelector('.cmd-body > div:first-child')
    expect([...(navigationGroup?.querySelectorAll('.cmd-item-title') ?? [])].map((item) => item.textContent)).toEqual([
      '홈',
      '공지',
      '내 검토요청',
      '변경 적용',
      '내 프로젝트',
      '내 담당',
    ])
  })

  it('describes every screen with its human name instead of a route id', () => {
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
    const subs = [...dialog.querySelectorAll('.cmd-item-sub')].map((item) => item.textContent ?? '')
    expect(subs.join(' ')).not.toMatch(/change-applications|review-stats|announcements|dashboard/)
    expect(within(dialog).getByRole('button', { name: /변경 적용\s*변경 적용 화면으로 이동/ })).toBeInTheDocument()
  })

  it.each([
    { label: 'leader', profile: previewLeader, leaderMode: true, actions: ['새 공지 쓰기', '공통변경 등록하기'] },
    { label: 'member', profile: previewMember, leaderMode: false, actions: ['새 검토요청 쓰기'] },
    {
      label: 'read-only team leader',
      profile: { ...previewLeader, id: 'team-leader', role: 'team_leader' } as Profile,
      leaderMode: true,
      actions: [],
    },
  ])('offers only the create actions a $label can do', ({ profile, leaderMode, actions }) => {
    render(
      <CommandPalette
        data={createPreviewData()}
        leaderMode={leaderMode}
        onClose={vi.fn()}
        open
        profile={profile}
        setActiveTab={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: '빠른 이동' })
    const actionGroup = [...dialog.querySelectorAll('.cmd-body > div')]
      .find((group) => group.querySelector('.cmd-group-label')?.textContent === '새로 만들기')
    expect([...(actionGroup?.querySelectorAll('.cmd-item-title') ?? [])].map((item) => item.textContent)).toEqual(actions)
  })

  it('keeps the announcements screen as the first match for “공지” and opens the composer from an action', async () => {
    const user = userEvent.setup()
    const setActiveTab = vi.fn()
    const onClose = vi.fn()
    window.sessionStorage.clear()
    render(
      <CommandPalette
        data={createPreviewData()}
        leaderMode
        onClose={onClose}
        open
        profile={previewLeader}
        setActiveTab={setActiveTab}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: '빠른 이동' })
    await user.type(within(dialog).getByRole('textbox'), '공지')
    expect(dialog.querySelector('.cmd-item.selected .cmd-item-title')).toHaveTextContent(/^공지$/)

    await user.click(within(dialog).getByRole('button', { name: /새 공지 쓰기/ }))
    expect(setActiveTab).toHaveBeenCalledWith('announcements', undefined)
    expect(onClose).toHaveBeenCalled()
    expect(window.sessionStorage.getItem(composerIntentStorageKey('announcements'))).not.toBeNull()
    window.sessionStorage.clear()
  })

  it('traps focus, locks body scrolling, and returns focus to its trigger on Escape', async () => {
    const user = userEvent.setup()
    render(<CommandPaletteHarness />)
    const trigger = screen.getByRole('button', { name: '빠른 이동 열기' })

    await user.click(trigger)

    const dialog = screen.getByRole('dialog', { name: '빠른 이동' })
    const searchInput = within(dialog).getByRole('textbox', { name: '화면, 검토요청, 파트원 검색' })
    const commandButtons = within(dialog).getAllByRole('button')
    expect(document.body.style.overflow).toBe('hidden')
    await waitFor(() => expect(searchInput).toHaveFocus())

    await user.tab({ shift: true })
    expect(commandButtons[commandButtons.length - 1]).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '빠른 이동' })).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
    expect(trigger).toHaveFocus()
  })

  it('ignores Escape while a later modal owns the topmost dialog position', () => {
    const onClose = vi.fn()
    render(
      <>
        <CommandPalette
          data={createPreviewData()}
          leaderMode
          onClose={onClose}
          open
          profile={previewLeader}
          setActiveTab={vi.fn()}
        />
        <section aria-label="상위 확인" aria-modal="true" role="dialog">
          상위 모달
        </section>
      </>,
    )

    const input = screen.getByRole('textbox', { name: '화면, 검토요청, 파트원 검색' })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '빠른 이동' })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '상위 확인' })).toBeInTheDocument()
  })
})
