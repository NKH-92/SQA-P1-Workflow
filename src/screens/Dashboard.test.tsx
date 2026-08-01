import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewMember } from '../demoData'
import { Dashboard } from './Dashboard'

afterEach(cleanup)

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
})
