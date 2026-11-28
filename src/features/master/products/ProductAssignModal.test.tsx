import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData } from '../../../demoData'
import type { AppData } from '../../../types'
import {
  ProductAssignModal,
  UNASSIGNED_PRODUCT_USER_ID,
  type ProductAssignmentForm,
} from './ProductAssignModal'

afterEach(cleanup)

function Harness({
  data,
  initial,
  onSubmit = vi.fn(),
}: {
  data: AppData
  initial: ProductAssignmentForm
  onSubmit?: () => void
}) {
  const [form, setForm] = useState<ProductAssignmentForm>(initial)
  return (
    <ProductAssignModal
      onClose={vi.fn()}
      data={data}
      assignments={data.productAssignments.filter((assignment) => assignment.product_id === initial.product_id)}
      profilesById={new Map(data.profiles.map((profile) => [profile.id, profile]))}
      memberOptions={data.profiles.filter((profile) => profile.role === 'member' && profile.is_active !== false)}
      productAssignment={form}
      setProductAssignment={setForm}
      onSubmit={onSubmit}
    />
  )
}

const assignmentDefaults = { unassigned_reason: '', transfer_pending_tasks: false }

describe('ProductAssignModal', () => {
  it('takes the reason for removing the owner inside the same dialog', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const assignment = data.productAssignments[0]!
    const onSubmit = vi.fn()

    render(<Harness data={data} initial={{
      ...assignmentDefaults,
      product_id: assignment.product_id,
      user_id: assignment.user_id,
      previous_user_id: assignment.user_id,
    }} onSubmit={onSubmit} />)
    await user.selectOptions(screen.getByLabelText('담당자'), UNASSIGNED_PRODUCT_USER_ID)

    const submit = screen.getByRole('button', { name: '담당자 없이 저장하기' })
    expect(submit).toBeDisabled()
    expect(screen.getByText('담당자를 없애는 이유를 적으면 저장할 수 있어요.')).toBeInTheDocument()

    const reason = screen.getByLabelText(/담당자를 없애는 이유/)
    await user.type(reason, '담당 제품군 조정 중')
    expect(reason).toHaveValue('담당 제품군 조정 중')
    expect(submit).toBeEnabled()
    await user.click(submit)
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog', { name: /사유/ })).not.toBeInTheDocument()
  })

  it('offers pending change-task transfer in the first pass when a new owner is chosen', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const pendingTask = data.productChangeTasks.find((task) => task.status === 'pending' && task.assignee_id)!
    const nextMember = data.profiles.find(
      (profile) => profile.role === 'member' && profile.is_active !== false && profile.id !== pendingTask.assignee_id,
    )!
    const currentAssignment = data.productAssignments.find((item) => item.product_id === pendingTask.product_id)!

    render(
      <Harness
        data={data}
        initial={{
          ...assignmentDefaults,
          product_id: pendingTask.product_id,
          user_id: currentAssignment.user_id,
          previous_user_id: currentAssignment.user_id,
        }}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: '제품 담당자 변경' })
    expect(within(dialog).getAllByRole('combobox')).toHaveLength(1)
    await user.selectOptions(within(dialog).getByLabelText('담당자'), nextMember.id)

    expect(within(dialog).getByText('1건')).toBeInTheDocument()
    const transfer = within(dialog).getByRole('checkbox', { name: /미완료 적용 업무도 새 담당자에게 넘기기/ })
    await user.click(transfer)
    expect(transfer).toBeChecked()
    expect(within(dialog).getAllByRole('combobox')).toHaveLength(1)
    expect(within(dialog).getByRole('button', { name: '담당자 저장하기' })).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: '닫기' })).toBeInTheDocument()
  })
})
