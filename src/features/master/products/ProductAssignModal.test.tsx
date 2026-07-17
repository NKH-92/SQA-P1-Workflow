import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData } from '../../../demoData'
import {
  ProductAssignModal,
  UNASSIGNED_PRODUCT_USER_ID,
  type ProductAssignmentForm,
} from './ProductAssignModal'

afterEach(cleanup)

describe('ProductAssignModal', () => {
  it('offers an unassigned state and an optional reason field', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const product = data.products[0]!
    const onSubmit = vi.fn()

    function Harness() {
      const [form, setForm] = useState<ProductAssignmentForm>({
        user_id: '',
        product_id: '',
        unassigned_reason: '',
        transfer_pending_tasks: false,
      })
      return (
        <ProductAssignModal
          open
          onClose={vi.fn()}
          data={data}
          memberOptions={data.profiles.filter((profile) => profile.role === 'member')}
          productAssignment={form}
          setProductAssignment={setForm}
          onSubmit={onSubmit}
        />
      )
    }

    render(<Harness />)
    await user.selectOptions(screen.getByLabelText('제품'), product.id)
    await user.selectOptions(screen.getByLabelText('담당 상태'), UNASSIGNED_PRODUCT_USER_ID)

    const reason = screen.getByLabelText(/담당자 미지정 사유/)
    await user.type(reason, '담당 제품군 조정 중')
    expect(reason).toHaveValue('담당 제품군 조정 중')
    expect(screen.getByRole('button', { name: '미지정으로 저장' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '미지정으로 저장' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('previews and explicitly opts into pending change-task transfer', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const pendingTask = data.productChangeTasks.find((task) => task.status === 'pending' && task.assignee_id)!
    const nextMember = data.profiles.find(
      (profile) => profile.role === 'member' && profile.id !== pendingTask.assignee_id,
    )!

    function Harness() {
      const [form, setForm] = useState<ProductAssignmentForm>({
        user_id: '',
        product_id: '',
        unassigned_reason: '',
        transfer_pending_tasks: false,
      })
      return (
        <ProductAssignModal
          open
          onClose={vi.fn()}
          data={data}
          memberOptions={data.profiles.filter((profile) => profile.role === 'member')}
          productAssignment={form}
          setProductAssignment={setForm}
          onSubmit={vi.fn()}
        />
      )
    }

    render(<Harness />)
    await user.selectOptions(screen.getByLabelText('제품'), pendingTask.product_id)
    await user.selectOptions(screen.getByLabelText('담당 상태'), nextMember.id)

    expect(screen.getByText(/미완료 변경 적용업무/)).toHaveTextContent('1건')
    const transfer = screen.getByRole('checkbox', { name: /미완료 적용업무도 새 담당자에게 이관/ })
    await user.click(transfer)
    expect(transfer).toBeChecked()
  })
})
