import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MutateFn, TabId } from '../app/types'
import { createPreviewData, previewLeader, previewMember } from '../demoData'
import type { AppData, Profile } from '../types'
import { HomeOffice } from './HomeOffice'

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

type SetActiveTab = (tab: TabId, entityId?: string) => void

function Harness({ profile, initial, toasts, editable = true, setActiveTab = vi.fn() }: {
  profile: Profile
  initial: AppData
  toasts?: string[]
  editable?: boolean
  setActiveTab?: SetActiveTab
}) {
  const [data, setData] = useState(initial)
  const mutate: MutateFn = async (operation, success) => {
    try {
      await operation()
    } catch (error) {
      toasts?.push(`error:${(error as Error).message}`)
      return false
    }
    const spec = typeof success === 'function' ? success() : success
    toasts?.push(typeof spec === 'string' ? spec : spec.text)
    return true
  }
  return editable
    ? <HomeOffice data={data} mutate={mutate} profile={profile} setActiveTab={setActiveTab} setData={setData} />
    : <HomeOffice data={data} profile={profile} setActiveTab={setActiveTab} />
}

function seatList() {
  return screen.getByRole('list', { name: '자리 배치' })
}

/** 보조기기가 읽는 글자(장식으로 숨긴 자리 표지 칩은 뺀다) */
function seatTexts() {
  return within(seatList()).getAllByRole('listitem').map((item) => {
    const copy = item.cloneNode(true) as HTMLElement
    copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove())
    return copy.textContent ?? ''
  })
}

describe('HomeOffice', () => {
  it('shows every seated person with their seat, row and personality', () => {
    render(<Harness initial={createPreviewData()} profile={previewLeader} />)

    expect(screen.getByRole('heading', { name: '우리 파트 사무실' })).toBeInTheDocument()
    expect(screen.getByText('8자리 중 4자리')).toBeInTheDocument()
    const items = seatTexts()
    expect(items).toHaveLength(4)
    expect(items[0]).toMatch(/^파트원 A, 2번 자리 · 창가 쪽 줄 · /)
    expect(items.find((item) => item.includes(previewLeader.name))).toMatch(/\(나\), 3번 자리/)
    expect(items.find((item) => item.includes('6번 자리'))).toContain('통로 쪽 줄')
  })

  it('opens the matching screen from each office object', () => {
    const setActiveTab = vi.fn()
    // 확인할 것이 없는 팀장 화면: 간판만 보이고 눌러도 목록 화면으로만 간다.
    render(<Harness initial={createPreviewData()} profile={{ ...previewLeader, role: 'team_leader' }} setActiveTab={setActiveTab} editable={false} />)
    const shortcuts = screen.getByRole('group', { name: '사무실 바로가기' })
    expect(within(shortcuts).getAllByRole('button').map((button) => button.textContent)).toEqual([
      '검토 통계›',
      '변경 적용›',
      '검토요청›',
      '공지›',
      '프로젝트›',
    ])
    fireEvent.click(within(shortcuts).getByRole('button', { name: '검토요청 보드, 검토요청으로 이동' }))
    fireEvent.click(within(shortcuts).getByRole('button', { name: '공지 화면, 공지로 이동' }))
    fireEvent.click(within(shortcuts).getByRole('button', { name: '변경관리 문서함, 변경 적용으로 이동' }))
    fireEvent.click(within(shortcuts).getByRole('button', { name: '프로젝트 보드, 프로젝트로 이동' }))
    expect(setActiveTab.mock.calls).toEqual([['reviews'], ['announcements'], ['change-applications'], ['projects']])
  })

  it('turns objects into alerts for what is new to a member and opens the new item directly', () => {
    const setActiveTab = vi.fn()
    const data = createPreviewData()
    render(<Harness editable={false} initial={data} profile={previewMember} setActiveTab={setActiveTab} />)
    const shortcuts = screen.getByRole('group', { name: '사무실 바로가기' })

    const notice = within(shortcuts).getByRole('button', { name: '공지 화면, 새 공지 1건, 공지로 이동' })
    expect(notice).toHaveAttribute('data-alert', 'new')
    expect(notice).toHaveTextContent('!공지1›')
    const projects = within(shortcuts).getByRole('button', { name: /^프로젝트 보드, 새로 배정된 프로젝트 1건/ })
    expect(projects).toHaveAttribute('data-alert', 'new')
    // 이미 확인했지만 아직 남은 적용 업무는 숫자만 보인다.
    const cabinet = within(shortcuts).getByRole('button', { name: /^변경관리 문서함, 미적용 업무 \d+건, 변경 적용으로 이동$/ })
    expect(cabinet).toHaveAttribute('data-alert', 'todo')
    expect(cabinet.textContent).not.toContain('!')

    fireEvent.click(notice)
    fireEvent.click(projects)
    fireEvent.click(cabinet)
    const newAssignment = data.projectAssignments.find((assignment) => assignment.id === 'project-assignment-1-1')!
    expect(setActiveTab.mock.calls).toEqual([
      ['announcements', 'announcement-01'],
      ['projects', newAssignment.project_id],
      ['change-applications'],
    ])
  })

  it('clears a new-item alert once the section has been checked', () => {
    const data = createPreviewData()
    const checked = {
      ...data,
      sectionReadMarks: (data.sectionReadMarks ?? []).map((mark) =>
        mark.user_id === previewMember.id && mark.section === 'announcements'
          ? { ...mark, seen_keys: data.announcements.map((announcement) => announcement.id) }
          : mark),
    }
    render(<Harness editable={false} initial={checked} profile={previewMember} />)
    const notice = screen.getByRole('button', { name: '공지 화면, 공지로 이동' })
    expect(notice).not.toHaveAttribute('data-alert')
  })

  it('does not show new-item alerts before the read marks are known', () => {
    const data = { ...createPreviewData(), sectionReadMarks: undefined }
    render(<Harness editable={false} initial={data} profile={previewMember} />)
    expect(screen.getByRole('button', { name: '공지 화면, 공지로 이동' })).not.toHaveAttribute('data-alert')
  })

  it('tells the leader how many new review requests wait for feedback', () => {
    const setActiveTab = vi.fn()
    render(<Harness initial={createPreviewData()} profile={previewLeader} setActiveTab={setActiveTab} />)
    const kanban = screen.getByRole('button', { name: /^검토요청 보드, 새 검토요청 \d+건 · 피드백 대기 \d+건, 검토요청으로 이동$/ })
    expect(kanban).toHaveAttribute('data-alert', 'new')
    fireEvent.click(kanban)
    expect(setActiveTab).toHaveBeenCalledWith('reviews', expect.any(String))
  })

  it('lets a member open only their own work from the office', () => {
    const setActiveTab = vi.fn()
    render(<Harness editable={false} initial={createPreviewData()} profile={previewMember} setActiveTab={setActiveTab} />)
    const people = within(seatList()).getAllByRole('button')
    expect(people.map((button) => button.getAttribute('aria-label'))).toEqual([`${previewMember.name}(나) 담당 보기`])
    fireEvent.click(people[0])
    expect(setActiveTab).toHaveBeenCalledWith('work')
  })

  it('lets a leader open each member’s team detail and their own projects', () => {
    const setActiveTab = vi.fn()
    const data = createPreviewData()
    render(<Harness initial={data} profile={previewLeader} setActiveTab={setActiveTab} />)
    fireEvent.click(within(seatList()).getByRole('button', { name: `${previewMember.name} 담당 보기` }))
    expect(setActiveTab).toHaveBeenLastCalledWith('team', previewMember.id)

    fireEvent.click(within(seatList()).getByRole('button', { name: `${previewLeader.name}(나) 담당 보기` }))
    expect(setActiveTab).toHaveBeenLastCalledWith('projects')
    expect(window.sessionStorage.getItem('sqa.view.projects.leader.view')).toBe(JSON.stringify('member'))
    expect(window.sessionStorage.getItem('sqa.view.projects.leader.query')).toBe(JSON.stringify(previewLeader.name))
  })

  it('lets only the leader open the seat editor', () => {
    const data = createPreviewData()
    const { unmount } = render(<Harness initial={data} profile={previewLeader} />)
    expect(screen.getByRole('button', { name: '자리 배치' })).toBeEnabled()
    unmount()

    render(<Harness editable={false} initial={data} profile={previewMember} />)
    expect(screen.queryByRole('button', { name: '자리 배치' })).not.toBeInTheDocument()
    cleanup()

    render(<Harness initial={data} profile={{ ...previewLeader, role: 'team_leader' }} />)
    expect(screen.queryByRole('button', { name: '자리 배치' })).not.toBeInTheDocument()
  })

  it('explains an empty office to each role', () => {
    const data = { ...createPreviewData(), officeLayout: { revision: 'r0', seats: [] } }
    const { unmount } = render(<Harness initial={data} profile={previewLeader} />)
    expect(screen.getByText('아직 자리를 배치하지 않았어요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '자리 배치하기' })).toBeInTheDocument()
    unmount()

    render(<Harness editable={false} initial={data} profile={previewMember} />)
    expect(screen.getByText('파트장이 자리를 배치하면 여기에 보여요.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '자리 배치하기' })).not.toBeInTheDocument()
  })

  it('remembers a collapsed office in this browser', () => {
    const data = createPreviewData()
    const { unmount } = render(<Harness initial={data} profile={previewMember} />)
    fireEvent.click(screen.getByRole('button', { name: '사무실 접기' }))
    expect(screen.queryByRole('list', { name: '자리 배치' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '사무실 펼치기' })).toHaveAttribute('aria-expanded', 'false')
    unmount()

    render(<Harness initial={data} profile={previewMember} />)
    expect(screen.getByRole('button', { name: '사무실 펼치기' })).toBeInTheDocument()
  })

  it('asks for a character gender before saving a newly seated person, then saves the layout', async () => {
    const toasts: string[] = []
    const base = createPreviewData()
    // 7번 자리 사람을 빼 두어 ‘처음 앉는 사람’으로 쓴다.
    const newcomer = base.officeLayout!.seats.find((seat) => seat.seat_index === 7)!
    const data = {
      ...base,
      officeLayout: { revision: 'r1', seats: base.officeLayout!.seats.filter((seat) => seat.seat_index !== 7) },
    }
    render(<Harness initial={data} profile={previewLeader} toasts={toasts} />)
    fireEvent.click(screen.getByRole('button', { name: '자리 배치' }))
    const dialog = screen.getByRole('dialog', { name: '사무실 자리 배치' })

    // 비어 있던 1번 자리에 3번 자리 사람(파트장)을 옮기면 캐릭터를 그대로 들고 온다.
    fireEvent.change(within(dialog).getByLabelText('1번 자리'), { target: { value: previewLeader.id } })
    expect(within(dialog).getByText('3번 자리에서 옮겨 왔어요.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('3번 자리')).toHaveValue('')

    // 처음 앉는 사람은 성별을 골라야 저장된다.
    fireEvent.change(within(dialog).getByLabelText('4번 자리'), { target: { value: newcomer.profile_id } })
    fireEvent.click(within(dialog).getByRole('button', { name: '저장하기' }))
    expect(within(dialog).getByText('캐릭터 성별을 골라 주세요.')).toBeInTheDocument()
    expect(within(dialog).getByRole('radiogroup', { name: '4번 자리 캐릭터 성별' })).toHaveAttribute('aria-invalid', 'true')
    expect(toasts).toEqual([])

    fireEvent.click(within(within(dialog).getByRole('radiogroup', { name: '4번 자리 캐릭터 성별' })).getByLabelText('여성'))
    fireEvent.click(within(dialog).getByRole('button', { name: '저장하기' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '사무실 자리 배치' })).not.toBeInTheDocument())
    expect(toasts).toEqual(['사무실 자리 배치를 저장했어요.'])
    const items = seatTexts()
    expect(items.some((item) => item.startsWith(`${previewLeader.name}(나), 1번 자리 · 창가 쪽 줄`))).toBe(true)
    expect(items.some((item) => item.startsWith(`${newcomer.name}, 4번 자리 · 창가 쪽 줄`))).toBe(true)
    expect(items.some((item) => item.includes('3번 자리'))).toBe(false)
  })

  it('keeps the save button off until something changes and says why', () => {
    render(<Harness initial={createPreviewData()} profile={previewLeader} />)
    fireEvent.click(screen.getByRole('button', { name: '자리 배치' }))
    const dialog = screen.getByRole('dialog', { name: '사무실 자리 배치' })
    expect(within(dialog).getByRole('button', { name: '저장하기' })).toBeDisabled()
    expect(within(dialog).getByText('자리나 캐릭터를 바꾸면 저장할 수 있어요.')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: '파트원 A 캐릭터 스타일 다시 뽑기' }))
    expect(within(dialog).getByRole('button', { name: '저장하기' })).toBeEnabled()
  })
})
