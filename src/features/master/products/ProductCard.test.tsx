import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData } from '../../../demoData'
import { ProductCard } from './ProductCard'

afterEach(cleanup)

describe('ProductCard', () => {
  it('shows the unassigned status and saved reason for a product without assignments', () => {
    const source = createPreviewData()
    const product = source.products.find(
      (item) => !source.productAssignments.some((assignment) => assignment.product_id === item.id),
    )!
    const updatedProduct = { ...product, unassigned_reason: '담당 제품군 조정 중' }
    const data = {
      ...source,
      products: source.products.map((item) => (item.id === product.id ? updatedProduct : item)),
    }

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
      />,
    )

    expect(screen.getByText('미지정')).toBeInTheDocument()
    expect(screen.getByText('담당 제품군 조정 중')).toBeInTheDocument()
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

    await user.click(screen.getByTitle('제품 삭제'))
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

    const confirm = screen.getByRole('button', { name: '삭제 확인' })
    expect(confirm).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: '삭제 사유' }), '중복 제품 정리')
    await user.click(confirm)

    expect(onDelete).toHaveBeenCalledWith(product.id, {
      expectedUpdatedAt: '2026-07-20T00:00:00.000Z',
      reason: '중복 제품 정리',
    })
  })
})
