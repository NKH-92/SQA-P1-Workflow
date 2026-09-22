import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader } from '../../../demoData'
import type { AppData } from '../../../types'
import { ProductMasterPanel } from './ProductMasterPanel'

// Force the local preview repository regardless of any real Supabase env
// configured for this dev checkout — this test exercises the UI wiring, not
// a live backend.
vi.mock('../../../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/supabase')>()
  return { ...actual, hasSupabaseConfig: false }
})

afterEach(cleanup)

/**
 * The reason prompt is the only UI surface between "저장" and the
 * actual OCC RPC call for an important master update, so its wiring is
 * covered directly rather than only through the repository-layer tests.
 */
function Harness({ initialData }: { initialData: AppData }) {
  const [data, setData] = useState(initialData)
  return (
    <ProductMasterPanel
      profile={previewLeader}
      data={data}
      setData={setData}
      mutate={async (operation) => {
        await operation()
        return true
      }}
    />
  )
}

describe('ProductMasterPanel reason-required update', () => {
  it('assigns directly from the selected product card without a separate allocation entry', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const product = data.products[0]!
    data.productAssignments = data.productAssignments.filter((item) => item.product_id !== product.id)
    const member = data.profiles.find((item) => item.role === 'member' && item.is_active !== false)!
    render(<Harness initialData={data} />)

    expect(screen.queryByRole('button', { name: '제품 배정' })).not.toBeInTheDocument()
    const card = screen.getByRole('heading', { name: product.name }).closest('article')!
    await user.click(within(card).getByRole('button', { name: '수정' }))
    const dialog = screen.getByRole('dialog', { name: '제품 담당자 수정' })
    expect(within(dialog).getByText(product.name)).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('제품')).not.toBeInTheDocument()
    await user.selectOptions(within(dialog).getByLabelText('담당 상태'), member.id)
    await user.click(within(dialog).getByRole('button', { name: '담당자 저장' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(card).getByText(member.name)).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: '수정' }))
    expect(screen.getByLabelText('담당 상태')).toHaveValue(member.id)
    await user.selectOptions(screen.getByLabelText('담당 상태'), '__unassigned__')
    await user.click(screen.getByRole('button', { name: '미지정으로 저장' }))
    const reasonDialog = screen.getByRole('dialog', { name: '제품 배정 해제 사유' })
    await user.type(within(reasonDialog).getByRole('textbox'), '담당자 재조정')
    await user.click(within(reasonDialog).getByRole('button', { name: '미지정 저장' }))
    expect(within(card).getByText('미지정')).toBeInTheDocument()
    expect(within(card).queryByText(member.name)).not.toBeInTheDocument()
  })

  it('blocks saving a product edit until a non-blank reason is entered, then applies the change', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const product = data.products[0]!

    render(<Harness initialData={data} />)

    await user.click(screen.getAllByTitle('제품 수정')[0]!)
    const nameInput = screen.getByDisplayValue(product.name)
    await user.clear(nameInput)
    await user.type(nameInput, 'Renamed by leader')
    await user.click(screen.getByRole('button', { name: '저장' }))

    // The reason modal opens instead of writing immediately.
    const dialog = screen.getByRole('dialog', { name: '제품 정보 변경 사유' })
    const submit = screen.getByRole('button', { name: '수정 저장' })
    expect(submit).toBeDisabled()

    await user.type(within(dialog).getByRole('textbox'), '가격 정책 변경에 따른 정보 수정')
    expect(submit).toBeEnabled()
    await user.click(submit)

    expect(await screen.findByText('Renamed by leader')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '제품 정보 변경 사유' })).not.toBeInTheDocument()
  })
})
