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
    expect(within(dialog).getByRole('button', { name: /공지\s*announcements 화면으로 이동/ })).toBeInTheDocument()
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
      '제품 마스터',
      '업무 카테고리',
      '초대 관리',
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
})
