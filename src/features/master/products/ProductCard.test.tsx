import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
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
})
