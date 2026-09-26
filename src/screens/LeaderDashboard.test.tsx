import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader } from '../demoData'
import type { AppData, Profile } from '../types'
import { selectLeaderPriorityQueue } from '../features/dashboard/prioritySelectors'
import { LeaderDashboard } from './LeaderDashboard'

beforeEach(() => {
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

function todoList() {
  return document.querySelector('.home-todo') as HTMLElement
}

describe('LeaderDashboard', () => {
  it('opens with today’s work instead of a hero, ring or KPI cards', () => {
    const data = createPreviewData()
    const total = selectLeaderPriorityQueue(data, data.profiles.filter((item) => item.role === 'member')).length

    render(<LeaderDashboard profile={previewLeader} data={data} setActiveTab={vi.fn()} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`오늘 처리할 일이 ${total}건 있어요`)
    expect(screen.getByText(new RegExp(`안녕하세요, ${previewLeader.name}님`))).toBeInTheDocument()
    expect(document.querySelector('.dashboard-hero, .dashboard-resolution-ring, .kpi-stat')).toBeNull()
    expect(screen.queryByText('월간 검토 처리')).not.toBeInTheDocument()
    expect(document.querySelector('.priority-row')).toBeInTheDocument()
  })

  it('filters the list with one row of chips whose numbers match the rows', () => {
    render(<LeaderDashboard profile={previewLeader} data={createPreviewData()} setActiveTab={vi.fn()} />)

    const chips = screen.getByRole('group', { name: '할 일 종류로 거르기' })
    expect(within(chips).getAllByRole('button').map((chip) => chip.textContent?.replace(/\s*\d+$/, ''))).toEqual([
      '전체',
      '검토 대기',
      '기한 지난 프로젝트',
      '미적용 변경',
      '담당자 없는 제품',
    ])
    const reviewChip = within(chips).getByRole('button', { name: /^검토 대기/ })
    const reviewCount = Number(reviewChip.textContent?.match(/(\d+)$/)?.[1])
    fireEvent.click(reviewChip)

    expect(reviewChip).toHaveAttribute('aria-pressed', 'true')
    const kinds = [...todoList().querySelectorAll('.priority-kind')].map((kind) => kind.textContent)
    expect(kinds).toHaveLength(reviewCount)
    expect(new Set(kinds)).toEqual(new Set(['검토요청']))
  })

  it('gives every row a type chip, a due state and a next action without nesting buttons', () => {
    const setActiveTab = vi.fn()
    render(<LeaderDashboard profile={previewLeader} data={createPreviewData()} setActiveTab={setActiveTab} />)

    const rows = [...todoList().querySelectorAll('.priority-row')]
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.querySelector('button button')).toBeNull()
      expect(row.querySelector('.priority-kind')).not.toBeNull()
      expect(row.querySelector('.priority-due')?.textContent).not.toMatch(/초과|D\+|지연/)
    }

    const firstReview = rows.find((row) => row.querySelector('.priority-kind')?.textContent === '검토요청')!
    const action = within(firstReview as HTMLElement).getByRole('button', { name: /검토하기$/ })
    fireEvent.click(action)
    expect(setActiveTab).toHaveBeenCalledWith('reviews', expect.any(String))
  })

  it('moves the owner assignment call to the top rail and opens products filtered to missing owners', () => {
    const setActiveTab = vi.fn()
    render(<LeaderDashboard profile={previewLeader} data={createPreviewData()} setActiveTab={setActiveTab} />)

    expect(screen.getByText(/담당자가 없는 제품이 \d+개 있어요/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '담당자 배정하기' }))

    expect(window.sessionStorage.getItem('sqa.view.products.leader.filter')).toBe(JSON.stringify('unassigned'))
    expect(setActiveTab).toHaveBeenCalledWith('products')
  })

  it('links the monthly review line to review statistics', () => {
    const setActiveTab = vi.fn()
    render(<LeaderDashboard profile={previewLeader} data={createPreviewData()} setActiveTab={setActiveTab} />)

    expect(screen.getByRole('heading', { name: '이번 달 검토' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '검토 통계 보기' }))
    expect(setActiveTab).toHaveBeenCalledWith('review-stats')
  })

  it('lists an application awaiting final review with a confirm action', () => {
    const setActiveTab = vi.fn()
    const source = createPreviewData()
    const target = source.changeApplications.find((item) => item.status === 'published')!
    const targetActionIds = new Set(source.changeActionItems
      .filter((item) => item.change_application_id === target.id)
      .map((item) => item.id))
    const data: AppData = {
      ...source,
      productChangeTasks: source.productChangeTasks.map((task) => targetActionIds.has(task.action_item_id)
        ? { ...task, status: 'completed' as const }
        : task),
      changeApplicationSummaries: [{
        change_application_id: target.id,
        workflow_status: 'final_review_ready' as const,
        total_count: 12,
        pending_count: 0,
        completed_count: 12,
        not_applicable_count: 0,
        scope_removed_count: 0,
        unresolved_cancelled_count: 0,
        unassigned_count: 0,
        processed_count: 12,
        percent: 100,
        can_finalize: true,
      }],
    }

    render(<LeaderDashboard profile={previewLeader} data={data} setActiveTab={setActiveTab} />)
    fireEvent.click(screen.getByRole('button', { name: /전체 \d+/ }))
    const showAll = screen.queryByRole('button', { name: /^나머지 \d+건 보기$/ })
    if (showAll) fireEvent.click(showAll)

    const finalRow = [...todoList().querySelectorAll('.priority-row')]
      .find((row) => row.textContent?.includes('최종 확인'))! as HTMLElement
    expect(finalRow).toHaveTextContent(target.title)
    fireEvent.click(within(finalRow).getByRole('button', { name: /확인하기$/ }))
    expect(setActiveTab).toHaveBeenCalledWith('change-applications', target.id)
  })

  it('shows a read-only team leader the same list without action buttons', () => {
    const teamLeader: Profile = { ...previewLeader, id: 'team-leader', name: '미리보기 팀장', role: 'team_leader' }
    const setActiveTab = vi.fn()
    render(<LeaderDashboard profile={teamLeader} data={createPreviewData()} setActiveTab={setActiveTab} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/파트에서 처리할 일이 \d+건 있어요/)
    expect(todoList().querySelector('.priority-action')).toBeNull()
    expect(screen.queryByRole('button', { name: '새 공지 쓰기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '담당자 배정하기' })).not.toBeInTheDocument()

    fireEvent.click(todoList().querySelector<HTMLButtonElement>('.priority-main')!)
    expect(setActiveTab).toHaveBeenCalled()
  })
})
