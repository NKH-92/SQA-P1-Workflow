import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MutateFn } from '../app/types'
import { createPreviewData, previewLeader } from '../demoData'
import { TeamPanel } from './TeamPanel'

afterEach(() => {
  cleanup()
  // 검색어·선택·제품 필터는 세션 동안 기억되므로 테스트마다 비운다.
  window.sessionStorage.clear()
})

describe('TeamPanel visible selection', () => {
  it('keeps the detail and memo target inside the filtered directory', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const members = data.profiles.filter((profile) => profile.role === 'member')
    expect(members.length).toBeGreaterThan(1)
    const target = members[1]!

    render(
      <TeamPanel
        data={data}
        mutate={vi.fn()}
        profile={previewLeader}
        setActiveTab={vi.fn()}
        setData={vi.fn()}
      />,
    )

    await user.type(screen.getByPlaceholderText('이름, 제품, 업무, 프로젝트 검색'), target.email)

    const detail = screen.getByText('선택 파트원').closest('.team-member-detail')
    expect(detail).not.toBeNull()
    expect(within(detail as HTMLElement).getByRole('heading', { name: target.name })).toBeInTheDocument()
    expect(within(detail as HTMLElement).getByRole('button', { name: /관리 메모/ })).toBeInTheDocument()
  })

  it('removes detail actions when the search has no visible member and offers to clear it', async () => {
    const user = userEvent.setup()

    render(
      <TeamPanel
        data={createPreviewData()}
        mutate={vi.fn()}
        profile={previewLeader}
        setActiveTab={vi.fn()}
        setData={vi.fn()}
      />,
    )

    await user.type(screen.getByPlaceholderText('이름, 제품, 업무, 프로젝트 검색'), '존재하지-않는-파트원')

    expect(screen.getByText('검색 조건에 맞는 파트원이 없어요')).toBeInTheDocument()
    expect(screen.queryByText('선택 파트원')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /관리 메모/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '검색어 지우기' }))
    expect(screen.getByText('선택 파트원')).toBeInTheDocument()
  })

  it('explains the card counters in plain words', () => {
    render(
      <TeamPanel
        data={createPreviewData()}
        mutate={vi.fn()}
        profile={previewLeader}
        setActiveTab={vi.fn()}
        setData={vi.fn()}
      />,
    )

    const card = document.querySelector('.v2-team-card') as HTMLElement
    expect(within(card).getByText('프로젝트')).toBeInTheDocument()
    expect(within(card).getByText('대기 검토')).toBeInTheDocument()
    expect(within(card).queryByText('과제')).not.toBeInTheDocument()
  })
})

describe('TeamPanel actions', () => {
  it('opens the product screen with a matching filter for the selected member', async () => {
    const user = userEvent.setup()
    const setActiveTab = vi.fn()

    render(
      <TeamPanel
        data={createPreviewData()}
        mutate={vi.fn()}
        profile={previewLeader}
        setActiveTab={setActiveTab}
        setData={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /제품 배정하기/ }))

    await waitFor(() => expect(setActiveTab).toHaveBeenCalledWith('products'))
    expect(JSON.parse(window.sessionStorage.getItem('sqa.view.products.leader.filter') ?? 'null')).toBe('all')
  })

  it('labels the memo field and asks before discarding an unsaved memo', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn<MutateFn>(async (operation) => {
      await operation()
      return true
    })
    const data = createPreviewData()

    render(
      <TeamPanel
        data={data}
        mutate={mutate}
        profile={previewLeader}
        setActiveTab={vi.fn()}
        setData={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /관리 메모/ }))
    const dialog = screen.getByRole('dialog')
    const memo = within(dialog).getByRole('textbox', { name: '새 메모' })
    await waitFor(() => expect(memo).toHaveFocus())
    expect(memo).toHaveAccessibleDescription(/볼 수 있어요/)

    await user.type(memo, '인수인계 메모')
    await user.click(within(dialog).getByRole('button', { name: '닫기' }))
    expect(within(dialog).getByText(/작성 중인 내용이 있어요/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '계속 쓰기' }))

    await user.click(within(dialog).getByRole('button', { name: '메모 저장하기' }))
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0]?.[1]).toMatch(/메모를 저장했어요/)
  })
})
