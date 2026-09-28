import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assignProduct } from '../../../data'
import { MASTER_STALE_MESSAGE } from '../../../data/validation/masterOcc'
import { createPreviewData, previewLeader } from '../../../demoData'
import { toUserMessage, UserFacingError } from '../../../lib/errors'
import type { AppData } from '../../../types'
import { ProductMasterPanel } from './ProductMasterPanel'

// Force the local preview repository regardless of any real Supabase env
// configured for this dev checkout — this test exercises the UI wiring, not
// a live backend.
vi.mock('../../../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/supabase')>()
  return { ...actual, hasSupabaseConfig: false }
})

// 담당자 교체 뒤 업무 넘기기(2단계)만 실패시키는 경우를 만들기 위해 감싼다. 기본은 실제 구현을 그대로 부른다.
vi.mock('../../../data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../data')>()
  return { ...actual, assignProduct: vi.fn(actual.assignProduct) }
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

let latestSetData: Dispatch<SetStateAction<AppData>> | null = null
const mutationErrors: string[] = []

/** 실제 mutate처럼 실패를 삼키고 false를 돌려주는 하네스(오류 문구는 mutationErrors에 모은다). */
function FailSafeHarness({ initialData }: { initialData: AppData }) {
  const [data, setData] = useState(initialData)
  useEffect(() => {
    latestData = data
    latestSetData = setData
  }, [data])
  return (
    <ProductMasterPanel
      profile={previewLeader}
      data={data}
      setData={setData}
      mutate={async (operation) => {
        try {
          await operation()
          return true
        } catch (error) {
          mutationErrors.push(toUserMessage(error))
          return false
        }
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

  it('closes the inline edit on a stale-write conflict so reopening takes the fresh revision', async () => {
    const user = userEvent.setup()
    mutationErrors.length = 0
    const data = createPreviewData()
    const product = data.products[0]!
    render(<FailSafeHarness initialData={data} />)

    await user.click(screen.getByRole('button', { name: `${product.name} 더보기` }))
    await user.click(screen.getByRole('menuitem', { name: '제품 정보 수정' }))
    // 수정 창을 열어 둔 사이에 다른 곳에서 같은 제품이 바뀌었다.
    act(() => {
      latestSetData!((current) => ({
        ...current,
        products: current.products.map((item) => (
          item.id === product.id ? { ...item, updated_at: '2099-01-01T00:00:00.000Z' } : item
        )),
      }))
    })
    const nameInput = screen.getByDisplayValue(product.name)
    await user.clear(nameInput)
    await user.type(nameInput, 'Stale rename')
    await user.click(screen.getByRole('button', { name: '저장' }))
    const dialog = screen.getByRole('dialog', { name: '제품 정보를 바꿀까요?' })
    await user.type(within(dialog).getByRole('textbox'), '이름 정리')
    await user.click(within(dialog).getByRole('button', { name: '저장하기' }))

    expect(mutationErrors).toEqual([MASTER_STALE_MESSAGE])
    expect(screen.queryByRole('dialog', { name: '제품 정보를 바꿀까요?' })).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Stale rename')).not.toBeInTheDocument()
    expect(latestData!.products.find((item) => item.id === product.id)!.name).toBe(product.name)

    // 다시 열면 최신 버전을 받아 저장된다.
    await user.click(screen.getByRole('button', { name: `${product.name} 더보기` }))
    await user.click(screen.getByRole('menuitem', { name: '제품 정보 수정' }))
    const reopened = screen.getByDisplayValue(product.name)
    await user.clear(reopened)
    await user.type(reopened, 'Fresh rename')
    await user.click(screen.getByRole('button', { name: '저장' }))
    const retryDialog = screen.getByRole('dialog', { name: '제품 정보를 바꿀까요?' })
    await user.type(within(retryDialog).getByRole('textbox'), '이름 정리')
    await user.click(within(retryDialog).getByRole('button', { name: '저장하기' }))

    expect(mutationErrors).toEqual([MASTER_STALE_MESSAGE])
    expect(await screen.findByText('Fresh rename')).toBeInTheDocument()
  })

  it('says the owner already changed when only the pending-task transfer fails', async () => {
    const user = userEvent.setup()
    mutationErrors.length = 0
    const data = createPreviewData()
    const pendingTask = data.productChangeTasks.find((task) => task.status === 'pending' && task.assignee_id)!
    const product = data.products.find((item) => item.id === pendingTask.product_id)!
    const nextMember = data.profiles.find(
      (profile) => profile.role === 'member' && profile.is_active !== false && profile.id !== pendingTask.assignee_id
        && !data.productAssignments.some((item) => item.product_id === product.id && item.user_id === profile.id),
    )!
    vi.mocked(assignProduct).mockRejectedValueOnce(new UserFacingError('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'))
    render(<FailSafeHarness initialData={data} />)

    const card = cardFor(product.name)
    await user.click(within(card).getByRole('button', { name: `${product.name} 담당자 변경` }))
    await user.selectOptions(screen.getByLabelText('담당자'), nextMember.id)
    await user.click(screen.getByRole('checkbox', { name: /미완료 적용 업무도 새 담당자에게 넘기기/ }))
    await user.click(screen.getByRole('button', { name: '담당자 저장하기' }))

    expect(mutationErrors).toEqual([
      `담당자는 ${nextMember.name}님으로 바꿨지만 미완료 적용 업무는 넘기지 못했어요. 한 번 더 저장해 주세요. (서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.)`,
    ])
    // 대화상자는 그대로 남아 바로 다시 저장할 수 있다.
    expect(screen.getByRole('dialog', { name: '제품 담당자 변경' })).toBeInTheDocument()
    expect(latestData!.productAssignments.filter((item) => item.product_id === product.id).map((item) => item.user_id))
      .toContain(nextMember.id)
    expect(latestData!.productChangeTasks.find((task) => task.id === pendingTask.id)!.assignee_id).toBe(pendingTask.assignee_id)
  })

  it('keeps the original error when the transfer fails without an owner change', async () => {
    const user = userEvent.setup()
    mutationErrors.length = 0
    const data = createPreviewData()
    const pendingTask = data.productChangeTasks.find((task) => task.status === 'pending' && task.assignee_id)!
    const product = data.products.find((item) => item.id === pendingTask.product_id)!
    const owner = data.productAssignments.find((item) => item.product_id === product.id)!
    // 담당자는 그대로 두고 다른 사람이 맡은 미완료 업무만 넘기는 경우(1단계 교체가 없다).
    const otherMember = data.profiles.find(
      (profile) => profile.role === 'member' && profile.is_active !== false && profile.id !== owner.user_id,
    )!
    data.productChangeTasks = data.productChangeTasks.map((task) => (
      task.id === pendingTask.id ? { ...task, assignee_id: otherMember.id } : task
    ))
    vi.mocked(assignProduct).mockRejectedValueOnce(new UserFacingError('원래 오류'))
    render(<FailSafeHarness initialData={data} />)

    const card = cardFor(product.name)
    await user.click(within(card).getByRole('button', { name: `${product.name} 담당자 변경` }))
    expect(screen.getByLabelText('담당자')).toHaveValue(owner.user_id)
    await user.click(screen.getByRole('checkbox', { name: /미완료 적용 업무도 새 담당자에게 넘기기/ }))
    await user.click(screen.getByRole('button', { name: '담당자 저장하기' }))

    expect(mutationErrors).toEqual(['원래 오류'])
  })

  it('reads a product CSV saved by Korean Excel (CP949)', async () => {
    const user = userEvent.setup()
    mutationErrors.length = 0
    render(<FailSafeHarness initialData={createPreviewData()} />)
    // "제품명,구분" 제목 행과 "가나,자사" 한 행(CP949 바이트).
    const cp949 = Uint8Array.from([
      0xc1, 0xa6, 0xc7, 0xb0, 0xb8, 0xed, 0x2c, 0xb1, 0xb8, 0xba, 0xd0, 0x0d, 0x0a,
      0xb0, 0xa1, 0xb3, 0xaa, 0x2c, 0xc0, 0xda, 0xbb, 0xe7, 0x0d, 0x0a,
    ])
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    await user.upload(input, new File([cp949], 'products.csv', { type: 'text/csv' }))

    expect(await screen.findByRole('heading', { name: '가나' })).toBeInTheDocument()
    expect(mutationErrors).toEqual([])
    expect(latestData!.products.find((item) => item.name === '가나')).toMatchObject({ category: '자사' })
  })
})
