import type { Dispatch, SetStateAction } from 'react'
import { Package, Plus } from 'lucide-react'
import { FormGrid, Modal } from '../../../components/ui'
import type { ProductCategory } from '../../../types'

type ProductRegisterForm = { name: string; category: ProductCategory; companyName: string }

export function ProductRegisterModal({
  open,
  onClose,
  productForm,
  setProductForm,
  onSubmit,
  submitting = false,
}: {
  open: boolean
  onClose: () => void
  productForm: ProductRegisterForm
  setProductForm: Dispatch<SetStateAction<ProductRegisterForm>>
  onSubmit: () => void
  submitting?: boolean
}) {
  const consigned = productForm.category === '위탁'
  const dirty = Boolean(productForm.name.trim()) || (consigned && Boolean(productForm.companyName.trim()))
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="제품 등록"
      titleId="product-register-title"
      eyebrow="제품"
      icon={<Package size={18} />}
      closeLabel="제품 등록 닫기"
      dirty={dirty && !submitting}
    >
      <FormGrid
        fields={
          <>
            <label>
              <span>제품명 <span aria-hidden="true">*</span></span>
              <input
                aria-required="true"
                value={productForm.name}
                onChange={(event) => setProductForm({ ...productForm, name: event.target.value })}
              />
            </label>
            <label>
              구분
              <select
                value={productForm.category}
                onChange={(event) => {
                  const category = event.target.value as ProductCategory
                  setProductForm({
                    ...productForm,
                    category,
                    companyName: category === '자사' ? '자사' : productForm.companyName === '자사' ? '' : productForm.companyName,
                  })
                }}
              >
                <option value="자사">자사</option>
                <option value="위탁">위탁</option>
              </select>
            </label>
            {consigned && (
              <label>
                위탁사명
                <input
                  placeholder="예: 위탁사 A"
                  value={productForm.companyName}
                  onChange={(event) => setProductForm({ ...productForm, companyName: event.target.value })}
                />
              </label>
            )}
          </>
        }
        onSubmit={onSubmit}
        onCancel={onClose}
        disabled={!productForm.name.trim()}
        disabledReason="제품명을 입력하면 등록할 수 있어요."
        icon={<Plus size={16} />}
        submitting={submitting}
        submitLabel="제품 등록하기"
      />
    </Modal>
  )
}
