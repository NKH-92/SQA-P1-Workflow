import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
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

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

let latestData: AppData | null = null

/**
 * The reason prompt is the only UI surface between "저장" and the
 * actual OCC RPC call for an important master update, so its wiring is
 * covered directly rather than only through the repository-layer tests.
 */
function Harness({ initialData }: { initialData: AppData }) {
  const [data, setData] = useState(initialData)
  useEffect(() => {
    latestData = data
  }, [data])
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

function cardFor(productName: string) {
  return screen.getByRole('heading', { name: productName }).closest('article')!
}

describe('ProductMasterPanel', () => {
  it('replaces only the chosen existing member on a product with multiple assignees', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const product = data.products[0]!
    const [first, second, replacement] = data.profiles.filter((item) => item.role === 'member' && item.is_active !== false)
    data.productAssignments = [first!, second!].map((member, index) => ({
      id: `assignment-${index}`,
      product_id: product.id,
      user_id: member.id,
      profiles: { name: member.name, email: member.email },
    }))
    render(<Harness initialData={data} />)
    const card = cardFor(product.name)
    await user.click(within(card).getByRole('button', { name: `${product.name} 담당자 변경` }))
    await user.selectOptions(screen.getByLabelText('변경할 기존 담당자'), second!.id)
    await user.selectOptions(screen.getByLabelText('담당자'), replacement!.id)
    await user.click(screen.getByRole('button', { name: '담당자 저장하기' }))
    expect(within(card).getByText(first!.name)).toBeInTheDocument()
    expect(within(card).getByText(replacement!.name)).toBeInTheDocument()
    expect(within(card).queryByText(second!.name)).not.toBeInTheDocument()
  })

  it('assigns, changes, and removes an owner from the product card without a second dialog', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const product = data.products[0]!
    data.productAssignments = data.productAssignments.filter((item) => item.product_id !== product.id)
    const member = data.profiles.find((item) => item.role === 'member' && item.is_active !== false)!
    render(<Harness initialData={data} />)

    expect(screen.queryByRole('button', { name: '제품 배정' })).not.toBeInTheDocument()
    const card = cardFor(product.name)
    await user.click(within(card).getByRole('button', { name: `${product.name} 담당자 배정` }))
    const dialog = screen.getByRole('dialog', { name: '제품 담당자 배정' })
    expect(within(dialog).getByText(product.name)).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('제품')).not.toBeInTheDocument()
    await user.selectOptions(within(dialog).getByLabelText('담당자'), member.id)
    await user.click(within(dialog).getByRole('button', { name: '담당자 저장하기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(card).getByText(member.name)).toBeInTheDocument()

    const replacement = data.profiles.find((item) => item.role === 'member' && item.is_active !== false && item.id !== member.id)!
    await user.click(within(card).getByRole('button', { name: `${product.name} 담당자 변경` }))
    await user.selectOptions(screen.getByLabelText('담당자'), replacement.id)
    await user.click(screen.getByRole('button', { name: '담당자 저장하기' }))
    expect(within(card).getByText(replacement.name)).toBeInTheDocument()
    expect(within(card).queryByText(member.name)).not.toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: `${product.name} 담당자 변경` }))
    expect(screen.getByLabelText('담당자')).toHaveValue(replacement.id)
    await user.selectOptions(screen.getByLabelText('담당자'), '__unassigned__')
    await user.type(screen.getByLabelText(/담당자를 없애는 이유/), '담당자 재조정')
    await user.click(screen.getByRole('button', { name: '담당자 없이 저장하기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(card).getByText('담당자 없음')).toBeInTheDocument()
    expect(within(card).getByText('담당자 재조정')).toBeInTheDocument()
    expect(within(card).queryByText(member.name)).not.toBeInTheDocument()
  })

  it('moves the pending change tasks together with a new owner in one save', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const pendingTask = data.productChangeTasks.find((task) => task.status === 'pending' && task.assignee_id)!
    const product = data.products.find((item) => item.id === pendingTask.product_id)!
    const nextMember = data.profiles.find(
      (profile) => profile.role === 'member' && profile.is_active !== false && profile.id !== pendingTask.assignee_id,
    )!
    render(<Harness initialData={data} />)

    const card = cardFor(product.name)
    await user.click(within(card).getByRole('button', { name: `${product.name} 담당자 변경` }))
    await user.selectOptions(screen.getByLabelText('담당자'), nextMember.id)
    await user.click(screen.getByRole('checkbox', { name: /미완료 적용 업무도 새 담당자에게 넘기기/ }))
    await user.click(screen.getByRole('button', { name: '담당자 저장하기' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(card).getByText(nextMember.name)).toBeInTheDocument()
    const movedTask = latestData!.productChangeTasks.find((task) => task.id === pendingTask.id)!
    expect(movedTask).toMatchObject({ assignee_id: nextMember.id, status: 'pending' })
    expect(latestData!.productAssignments.filter((item) => item.product_id === product.id).map((item) => item.user_id))
      .toEqual([nextMember.id])
  })

  it('filters products by owner state and remembers the filter the home callout sets', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const unassigned = data.products.filter(
      (product) => !data.productAssignments.some((assignment) => assignment.product_id === product.id),
    )
    const assigned = data.products.find(
      (product) => data.productAssignments.some((assignment) => assignment.product_id === product.id),
    )!
    expect(unassigned.length).toBeGreaterThan(0)
    // 홈의 ‘담당자 배정하기’는 이 키를 'unassigned'로 바꾼 뒤 제품 화면으로 이동한다.
    window.sessionStorage.setItem('sqa.view.products.leader.filter', JSON.stringify('unassigned'))
    render(<Harness initialData={data} />)

    const filters = screen.getByRole('group', { name: '담당 상태로 거르기' })
    expect(within(filters).getByRole('button', { name: /^담당자 없음/ })).toHaveAttribute('aria-pressed', 'true')
    for (const product of unassigned) expect(screen.getByRole('heading', { name: product.name })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: assigned.name })).not.toBeInTheDocument()

    await user.click(within(filters).getByRole('button', { name: /^전체/ }))
    expect(screen.getByRole('heading', { name: assigned.name })).toBeInTheDocument()
    expect(window.sessionStorage.getItem('sqa.view.products.leader.filter')).toBe(JSON.stringify('all'))
  })

  it('blocks saving a product edit until a non-blank reason is entered, then applies the change', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const product = data.products[0]!

    render(<Harness initialData={data} />)

    await user.click(screen.getByRole('button', { name: `${product.name} 더보기` }))
    await user.click(screen.getByRole('menuitem', { name: '제품 정보 수정' }))
    const nameInput = screen.getByDisplayValue(product.name)
    await user.clear(nameInput)
    await user.type(nameInput, 'Renamed by leader')
    await user.click(screen.getByRole('button', { name: '저장' }))

    // The reason modal opens instead of writing immediately.
    const dialog = screen.getByRole('dialog', { name: '제품 정보를 바꿀까요?' })
    const submit = within(dialog).getByRole('button', { name: '저장하기' })
    expect(submit).toBeDisabled()

    await user.type(within(dialog).getByRole('textbox'), '가격 정책 변경에 따른 정보 수정')
    expect(submit).toBeEnabled()
    await user.click(submit)

    expect(await screen.findByText('Renamed by leader')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '제품 정보를 바꿀까요?' })).not.toBeInTheDocument()
  })
})
