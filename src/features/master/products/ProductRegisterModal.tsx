import type { Dispatch, SetStateAction } from 'react'
import { Package } from 'lucide-react'
import { FormGrid, Modal } from '../../../components/ui'
import type { ProductCategory } from '../../../types'

export function ProductRegisterModal({
  open,
  onClose,
  productForm,
  setProductForm,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  productForm: { name: string; category: ProductCategory; companyName: string }
  setProductForm: Dispatch<SetStateAction<{ name: string; category: ProductCategory; companyName: string }>>
  onSubmit: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="제품 등록"
      titleId="product-register-title"
      eyebrow="제품 마스터"
      icon={<Package size={18} />}
      closeLabel="제품 등록 닫기"
    >
      <FormGrid
        fields={
          <>
            <label>
              제품명
              <input value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} />
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
            <label>
              위탁사명
              <input
                value={productForm.companyName}
                onChange={(event) => setProductForm({ ...productForm, companyName: event.target.value })}
              />
            </label>
          </>
        }
        onSubmit={onSubmit}
        disabled={!productForm.name.trim()}
        submitLabel="제품 추가"
      />
    </Modal>
  )
}
