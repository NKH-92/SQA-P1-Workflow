import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MutateFn } from '../app/types'
import { createPreviewData, previewLeader, previewMember } from '../demoData'
import type { AppData, Profile } from '../types'
import { ProjectsPanel } from './ProjectsPanel'

afterEach(() => {
  cleanup()
  // 검색어·필터·작성 중인 새 프로젝트는 세션 동안 기억되므로 테스트마다 비운다.
  window.sessionStorage.clear()
})

function makeMutate() {
  return vi.fn<MutateFn>(async (operation) => {
    await operation()
    return true
  })
}

/** 로컬 저장소가 실제로 목록을 바꾸도록 setData를 상태에 연결한 하네스 */
function StatefulProjects({ profile = previewLeader, mutate, initial }: { profile?: Profile; mutate: MutateFn; initial?: AppData }) {
  const [data, setData] = useState<AppData>(() => initial ?? createPreviewData())
  return <ProjectsPanel data={data} mutate={mutate} profile={profile} setData={setData} />
}

function projectCard(name: string) {
  const card = screen.getAllByRole('article').find((article) => within(article).queryByRole('heading', { name: new RegExp(name) }))
  if (!card) throw new Error(`project card not found: ${name}`)
  return card
}

describe('ProjectsPanel', () => {
  it('offers the current leader as a project assignee even when the profile list omits self', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    data.profiles = data.profiles.filter((profile) => profile.id !== previewLeader.id)
    expect(data.profiles.some((profile) => profile.id === previewLeader.id)).toBe(false)

    render(
      <ProjectsPanel
        profile={previewLeader}
        data={data}
        mutate={vi.fn()}
        setData={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '프로젝트 만들기' }))
    const dialog = screen.getByRole('dialog', { name: '무엇을 함께 만들까요?' })
    expect(within(dialog).getByText(`${previewLeader.name} (나)`)).toBeInTheDocument()
    expect(within(dialog).queryByText(/부하|워크로드/)).not.toBeInTheDocument()
  })

  it('labels every composer field and explains a missing name inline', async () => {
    const user = userEvent.setup()
    const mutate = makeMutate()
    render(<StatefulProjects mutate={mutate} />)

    await user.click(screen.getByRole('button', { name: '프로젝트 만들기' }))
    const dialog = screen.getByRole('dialog', { name: '무엇을 함께 만들까요?' })
    expect(within(dialog).getByRole('textbox', { name: '프로젝트 이름' })).toBeInTheDocument()
    expect(within(dialog).getByRole('group', { name: '상태' })).toBeInTheDocument()
    expect(within(dialog).getByRole('group', { name: '담당자' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /^프로젝트 만들기/ }))
    const nameInput = within(dialog).getByRole('textbox', { name: '프로젝트 이름' })
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput).toHaveAccessibleDescription('프로젝트 이름을 입력해 주세요')
    expect(nameInput).toHaveFocus()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('keeps a half-written project when the composer is closed and reopened', async () => {
    const user = userEvent.setup()
    render(<StatefulProjects mutate={makeMutate()} />)

    await user.click(screen.getByRole('button', { name: '프로젝트 만들기' }))
    await user.type(screen.getByRole('textbox', { name: '프로젝트 이름' }), '쓰던 프로젝트')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '무엇을 함께 만들까요?' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '프로젝트 만들기' }))
    expect(screen.getByRole('textbox', { name: '프로젝트 이름' })).toHaveValue('쓰던 프로젝트')
  })

  it('creates a project and shows it on the board', async () => {
    const user = userEvent.setup()
    const mutate = makeMutate()
    render(<StatefulProjects mutate={mutate} />)

    await user.click(screen.getByRole('button', { name: '프로젝트 만들기' }))
    const dialog = screen.getByRole('dialog', { name: '무엇을 함께 만들까요?' })
    await user.type(within(dialog).getByRole('textbox', { name: '프로젝트 이름' }), '새 점검 프로젝트')
    await user.click(within(dialog).getByRole('button', { name: /파트원 A/ }))
    await user.click(within(dialog).getByRole('button', { name: '프로젝트 만들기 · 담당자 1명' }))

    expect(mutate.mock.calls[0]?.[1]).toBe('‘새 점검 프로젝트’를 만들었어요.')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '무엇을 함께 만들까요?' })).not.toBeInTheDocument())
    const card = projectCard('새 점검 프로젝트')
    expect(within(card).getByText(/파트원 A/)).toBeInTheDocument()
  })

  it('merges the board and the list: cards open the editor and never nest buttons', async () => {
    const user = userEvent.setup()
    const mutate = makeMutate()
    render(<StatefulProjects mutate={mutate} />)

    expect(document.querySelectorAll('button button, a button, button a').length).toBe(0)
    const card = projectCard('정산 자동화')
    expect(card).toHaveAttribute('data-project-id', 'project-02')

    await user.click(within(card).getByRole('button', { name: '정산 자동화 수정' }))
    const dialog = screen.getByRole('dialog', { name: '프로젝트 정보 수정' })
    const nameInput = within(dialog).getByRole('textbox', { name: '프로젝트 이름' })
    await waitFor(() => expect(nameInput).toHaveFocus())
    await user.clear(nameInput)
    await user.type(nameInput, '정산 자동화 2차')
    await user.click(within(dialog).getByRole('button', { name: '저장하기' }))

    expect(mutate.mock.calls[0]?.[1]).toBe('‘정산 자동화 2차’ 정보를 저장했어요.')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '프로젝트 정보 수정' })).not.toBeInTheDocument())
    expect(projectCard('정산 자동화 2차')).toHaveAttribute('data-project-id', 'project-02')
  })

  it('asks before discarding edited project details', async () => {
    const user = userEvent.setup()
    render(<StatefulProjects mutate={makeMutate()} />)

    await user.click(within(projectCard('정산 자동화')).getByRole('button', { name: '정산 자동화 수정' }))
    const dialog = screen.getByRole('dialog', { name: '프로젝트 정보 수정' })
    await user.type(within(dialog).getByRole('textbox', { name: '설명' }), ' 추가 메모')
    await user.click(within(dialog).getByRole('button', { name: '닫기' }))
    expect(within(dialog).getByText(/작성 중인 내용이 있어요/)).toBeInTheDocument()
  })

  it('changes a project status from the card without opening a form', async () => {
    const user = userEvent.setup()
    const mutate = makeMutate()
    render(<StatefulProjects mutate={mutate} />)

    const card = projectCard('정산 자동화')
    await user.click(within(card).getByRole('button', { name: '진행 중, 정산 자동화 상태 바꾸기' }))
    await user.click(screen.getByRole('menuitemradio', { name: '완료' }))

    expect(mutate.mock.calls[0]?.[1]).toBe('‘정산 자동화’ 상태를 완료로 바꿨어요.')
    const moved = await screen.findByRole('button', { name: '완료, 정산 자동화 상태 바꾸기' })
    await waitFor(() => expect(moved).toHaveFocus())
    // 끝난 프로젝트는 기한이 지나도 ‘지남’으로 보이지 않는다.
    expect(within(projectCard('정산 자동화')).queryByText(/지남/)).not.toBeInTheDocument()
  })

  it('moves rare actions into the more menu and deletes with a required reason', async () => {
    const user = userEvent.setup()
    const mutate = makeMutate()
    render(<StatefulProjects mutate={mutate} />)

    const card = projectCard('정산 자동화')
    expect(within(card).queryByRole('button', { name: '링크 복사' })).not.toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: '정산 자동화 더보기' }))
    expect(screen.getByRole('menuitem', { name: '링크 복사' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: '삭제' }))

    const dialog = screen.getByRole('dialog', { name: '‘정산 자동화’를 삭제할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '삭제하기' }))
    expect(within(dialog).getByText('삭제 사유를 입력해 주세요')).toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()

    await user.type(within(dialog).getByRole('textbox', { name: '삭제 사유' }), '중복 프로젝트 정리')
    await user.click(within(dialog).getByRole('button', { name: '삭제하기' }))
    expect(mutate.mock.calls[0]?.[1]).toBe('‘정산 자동화’를 삭제했어요.')
    await waitFor(() => expect(document.querySelector('[data-project-id="project-02"]')).toBeNull())
  })

  it('keeps every assignee on the card while searching by one member name', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const [first, second] = data.profiles.filter((profile) => profile.role === 'member')
    const project = data.projects[0]!
    data.projectAssignments = [
      ...data.projectAssignments.filter((assignment) => assignment.project_id !== project.id),
      { id: 'pa-x1', project_id: project.id, user_id: first!.id, notes: null, profiles: { name: first!.name, email: first!.email } },
      { id: 'pa-x2', project_id: project.id, user_id: second!.id, notes: null, profiles: { name: second!.name, email: second!.email } },
    ]
    render(<StatefulProjects initial={data} mutate={makeMutate()} />)

    await user.type(screen.getByRole('textbox', { name: '프로젝트 검색' }), first!.name)
    const card = projectCard(project.name)
    expect(within(card).getByText(new RegExp(second!.name))).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: `${project.name} 담당자 변경` }))
    const dialog = screen.getByRole('dialog', { name: project.name })
    expect(within(dialog).getByRole('button', { name: /담당자 저장하기 · 2명/ })).toBeInTheDocument()
  })

  it('shows members a read-only board without management controls', () => {
    render(<StatefulProjects mutate={makeMutate()} profile={previewMember} />)

    expect(screen.queryByRole('button', { name: '프로젝트 만들기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /상태 바꾸기/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /담당자 변경|담당자 배정/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '프로젝트 보기 방식' })).not.toBeInTheDocument()
  })

  it('explains an empty filter result and offers to clear it', async () => {
    const user = userEvent.setup()
    render(<StatefulProjects mutate={makeMutate()} />)

    await user.type(screen.getByRole('textbox', { name: '프로젝트 검색' }), '없는 프로젝트 이름')
    expect(screen.getByText('조건에 맞는 프로젝트가 없어요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '조건 지우기' }))
    expect(screen.getByRole('textbox', { name: '프로젝트 검색' })).toHaveValue('')
    expect(projectCard('정산 자동화')).toBeInTheDocument()
  })
})
