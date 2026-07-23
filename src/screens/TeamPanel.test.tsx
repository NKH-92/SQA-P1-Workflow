import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader } from '../demoData'
import { TeamPanel } from './TeamPanel'

afterEach(cleanup)

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
    expect(within(detail as HTMLElement).getByText(target.name)).toBeInTheDocument()
    expect(within(detail as HTMLElement).getByRole('button', { name: /관리 메모/ })).toBeInTheDocument()
  })

  it('removes detail actions when the search has no visible member', async () => {
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

    expect(screen.getByText('검색 조건에 맞는 파트원이 없습니다.')).toBeInTheDocument()
    expect(screen.queryByText('선택 파트원')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /관리 메모/ })).not.toBeInTheDocument()
  })
})
