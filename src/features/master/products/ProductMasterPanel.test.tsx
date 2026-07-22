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
