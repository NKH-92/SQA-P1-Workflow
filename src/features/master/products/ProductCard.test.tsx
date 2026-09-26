import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData } from '../../../demoData'
import { ProductCard } from './ProductCard'

afterEach(cleanup)

describe('ProductCard', () => {
  it('shows the unassigned status, the saved reason, and one assign action for a product without assignments', async () => {
    const user = userEvent.setup()
    const source = createPreviewData()
    const product = source.products.find(
      (item) => !source.productAssignments.some((assignment) => assignment.product_id === item.id),
    )!
    const updatedProduct = { ...product, unassigned_reason: '담당 제품군 조정 중' }
    const data = {
      ...source,
      products: source.products.map((item) => (item.id === product.id ? updatedProduct : item)),
    }
    const onAssign = vi.fn()

    render(
      <ProductCard
        product={updatedProduct}
        data={data}
        productEdits={{}}
        setProductEdits={vi.fn()}
        onSave={vi.fn()}
        pendingDelete={null}
        setPendingDelete={vi.fn()}
        onDelete={vi.fn()}
        onAssign={onAssign}
      />,
    )

    expect(screen.getByText('담당자 없음')).toBeInTheDocument()
    expect(screen.getByText('담당 제품군 조정 중')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: `${product.name} 담당자 배정` }))
    expect(onAssign).toHaveBeenCalledWith(product.id)
    // 드문 행동(정보 수정·삭제)은 더보기 메뉴에 있다.
    expect(screen.queryByRole('button', { name: '제품 정보 수정' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: `${product.name} 더보기` }))
    expect(screen.getByRole('menuitem', { name: '제품 정보 수정' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '제품 삭제' })).toBeInTheDocument()
  })

  it('labels the single card action as a change once a product has an owner', () => {
    const source = createPreviewData()
    const assignment = source.productAssignments[0]!
    const product = source.products.find((item) => item.id === assignment.product_id)!

    render(
      <ProductCard
        product={product}
        data={source}
        productEdits={{}}
        setProductEdits={vi.fn()}
        onSave={vi.fn()}
        pendingDelete={null}
        setPendingDelete={vi.fn()}
        onDelete={vi.fn()}
        onAssign={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: `${product.name} 담당자 변경` })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `${product.name} 담당자 배정` })).not.toBeInTheDocument()
  })

  it('requires a reason and keeps the revision captured when delete confirmation opened', async () => {
    const user = userEvent.setup()
    const source = createPreviewData()
    const product = { ...source.products[0]!, updated_at: '2026-07-20T00:00:00.000Z' }
    const onDelete = vi.fn()
    let pendingDelete: Parameters<typeof ProductCard>[0]['pendingDelete'] = null
    const setPendingDelete = vi.fn((value: Parameters<typeof ProductCard>[0]['pendingDelete']) => {
      pendingDelete = value
    })
    const baseProps = {
      data: { ...source, products: [product] },
      productEdits: {},
      setProductEdits: vi.fn(),
      onSave: vi.fn(),
      setPendingDelete,
      onDelete,
    }
    const { rerender } = render(
      <ProductCard {...baseProps} product={product} pendingDelete={pendingDelete} />,
    )

    await user.click(screen.getByRole('button', { name: `${product.name} 더보기` }))
    await user.click(screen.getByRole('menuitem', { name: '제품 삭제' }))
    expect(pendingDelete).toEqual({
      table: 'products',
      id: product.id,
      expectedUpdatedAt: '2026-07-20T00:00:00.000Z',
    })

    const refreshedProduct = { ...product, updated_at: '2026-07-20T00:05:00.000Z' }
    rerender(
      <ProductCard
        {...baseProps}
        data={{ ...source, products: [refreshedProduct] }}
        product={refreshedProduct}
        pendingDelete={pendingDelete}
      />,
    )

    const confirm = screen.getByRole('button', { name: '삭제하기' })
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument()
    // 사유 없이 누르면 칸 아래에 이유를 보여주고 삭제하지 않는다.
    await user.click(confirm)
    expect(screen.getByText('삭제 사유를 적어 주세요. 사유는 감사 이력에 남아요.')).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
    await user.type(screen.getByRole('textbox', { name: '삭제 사유' }), '중복 제품 정리')
    await user.click(confirm)

    expect(onDelete).toHaveBeenCalledWith(product.id, {
      expectedUpdatedAt: '2026-07-20T00:00:00.000Z',
      reason: '중복 제품 정리',
    })
  })

  it('asks for the consignment company only for consigned products while editing', async () => {
    const user = userEvent.setup()
    const source = createPreviewData()
    const product = { ...source.products[0]!, category: '자사', company_name: '자사' }
    const setProductEdits = vi.fn()
    const edit = { name: product.name, category: '자사', companyName: '자사', unassignedReason: '', expectedUpdatedAt: null }

    const { rerender } = render(
      <ProductCard
        product={product}
        data={{ ...source, products: [product] }}
        productEdits={{ [product.id]: edit }}
        setProductEdits={setProductEdits}
        onSave={vi.fn()}
        pendingDelete={null}
        setPendingDelete={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText('위탁사명')).not.toBeInTheDocument()

    rerender(
      <ProductCard
        product={product}
        data={{ ...source, products: [product] }}
        productEdits={{ [product.id]: { ...edit, category: '위탁', companyName: '' } }}
        setProductEdits={setProductEdits}
        onSave={vi.fn()}
        pendingDelete={null}
        setPendingDelete={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('위탁사명')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(setProductEdits).toHaveBeenCalled()
  })
})
