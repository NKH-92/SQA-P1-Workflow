import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewMember } from '../demoData'
import { composerIntentStorageKey } from '../lib/navigation'
import type { AppData } from '../types'
import { Dashboard } from './Dashboard'

beforeEach(() => {
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

function isoDay(offsetDays: number) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

describe('Dashboard', () => {
  it('shows each product pending change count and opens its first pending application', () => {
    const data = createPreviewData()
    const ownPendingTask = data.productChangeTasks.find(
      (task) => task.assignee_id === previewMember.id && task.status === 'pending',
    )!
    const assignment = data.productAssignments.find(
      (item) => item.user_id === previewMember.id && item.product_id === ownPendingTask.product_id,
    )!
    const actionItem = data.changeActionItems.find((item) => item.id === ownPendingTask.action_item_id)!
    const setActiveTab = vi.fn()

    render(<Dashboard profile={previewMember} data={data} setActiveTab={setActiveTab} />)

    const productLink = screen.getByRole('button', {
      name: `${assignment.products?.name} 미적용 공통변경 1건 열기`,
    })
    expect(productLink).toHaveTextContent('미적용 1건')

    fireEvent.click(productLink)
    expect(setActiveTab).toHaveBeenCalledWith('change-applications', actionItem.change_application_id)
  })

  it('counts one common change once when a product has multiple pending action items', () => {
    const data = createPreviewData()
    const ownPendingTask = data.productChangeTasks.find(
      (task) => task.assignee_id === previewMember.id && task.status === 'pending',
    )!
    const assignment = data.productAssignments.find(
      (item) => item.user_id === previewMember.id && item.product_id === ownPendingTask.product_id,
    )!
    data.productChangeTasks.push({ ...ownPendingTask, id: 'duplicate-action-task' })

    render(<Dashboard profile={previewMember} data={data} setActiveTab={vi.fn()} />)

    expect(screen.getByRole('button', {
      name: `${assignment.products?.name} 미적용 공통변경 1건 열기`,
    })).toHaveTextContent('미적용 1건')
  })

  it('greets without a time-of-day phrase and states today’s work in the heading', () => {
    render(<Dashboard profile={previewMember} data={createPreviewData()} setActiveTab={vi.fn()} />)

    expect(screen.getByText(new RegExp(`안녕하세요, ${previewMember.name}님`))).toBeInTheDocument()
    expect(screen.queryByText(/좋은 아침/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/오늘 할 일이 \d+건 있어요/)
    expect(document.querySelector('.kpi-stat, .dashboard-hero')).toBeNull()
  })

  it('never calls overdue work imminent and shows finished projects as done, not overdue', () => {
    const data: AppData = createPreviewData()
    const projectId = 'project-member-overdue'
    const doneProjectId = 'project-member-done'
    data.projects = [
      ...data.projects,
      { id: projectId, name: '지난 프로젝트', description: '', deadline: isoDay(-5), status: 'in_progress', created_by: 'leader' },
      { id: doneProjectId, name: '끝난 프로젝트', description: '', deadline: isoDay(-30), status: 'done', created_by: 'leader' },
    ]
    data.projectAssignments = [
      ...data.projectAssignments,
      { id: 'pa-overdue', project_id: projectId, user_id: previewMember.id, notes: null },
      { id: 'pa-done', project_id: doneProjectId, user_id: previewMember.id, notes: null },
    ]

    render(<Dashboard profile={previewMember} data={data} setActiveTab={vi.fn()} />)

    expect(screen.queryByText(/마감 임박/)).not.toBeInTheDocument()
    const overdueRow = screen.getByRole('button', { name: /지난 프로젝트/ })
    expect(overdueRow).toHaveTextContent('5일 지남')
    expect(screen.queryByText('끝난 프로젝트')).not.toBeInTheDocument()
  })

  it('filters the single task list with chips and opens each row', () => {
    const setActiveTab = vi.fn()
    render(<Dashboard profile={previewMember} data={createPreviewData()} setActiveTab={setActiveTab} />)

    const chips = screen.getByRole('group', { name: '할 일 종류로 거르기' })
    fireEvent.click(within(chips).getByRole('button', { name: /^적용 업무/ }))
    const rows = [...document.querySelectorAll('.home-todo .priority-row')]
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row).toHaveTextContent('적용 업무')

    fireEvent.click(rows[0].querySelector('button')!)
    expect(setActiveTab).toHaveBeenCalledWith('change-applications', expect.any(String))
  })

  it('offers “검토요청 쓰기” in the header and asks the reviews screen to open the composer', () => {
    const setActiveTab = vi.fn()
    render(<Dashboard profile={previewMember} data={createPreviewData()} setActiveTab={setActiveTab} />)

    fireEvent.click(screen.getByRole('button', { name: '검토요청 쓰기' }))

    expect(setActiveTab).toHaveBeenCalledWith('reviews')
    expect(window.sessionStorage.getItem(composerIntentStorageKey('reviews'))).not.toBeNull()
  })
})
