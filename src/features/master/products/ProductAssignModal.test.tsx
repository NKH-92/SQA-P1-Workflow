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
})
