import type { Dispatch, SetStateAction } from 'react'
import { Users } from 'lucide-react'
import { FormGrid, Modal } from '../../../components/ui'
import type { AppData, Profile } from '../../../types'

export const UNASSIGNED_PRODUCT_USER_ID = '__unassigned__'

export type ProductAssignmentForm = {
  user_id: string
  product_id: string
  unassigned_reason: string
}

export function ProductAssignModal({
  open,
  onClose,
  data,
  memberOptions,
  productAssignment,
  setProductAssignment,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  data: AppData
  memberOptions: Profile[]
  productAssignment: ProductAssignmentForm
  setProductAssignment: Dispatch<SetStateAction<ProductAssignmentForm>>
  onSubmit: () => void
}) {
  const isUnassigned = productAssignment.user_id === UNASSIGNED_PRODUCT_USER_ID

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="제품 배정"
      titleId="product-assign-title"
      eyebrow="제품 마스터"
      icon={<Users size={18} />}
      closeLabel="제품 배정 닫기"
    >
      <FormGrid
        fields={
          <>
            <label>
              담당 상태
              <select
                value={productAssignment.user_id}
                onChange={(event) => {
                  const userId = event.target.value
                  const selectedProduct = data.products.find((product) => product.id === productAssignment.product_id)
                  setProductAssignment({
                    ...productAssignment,
                    user_id: userId,
                    unassigned_reason:
                      userId === UNASSIGNED_PRODUCT_USER_ID ? selectedProduct?.unassigned_reason ?? '' : '',
                  })
                }}
              >
                <option value="">선택</option>
                <option value={UNASSIGNED_PRODUCT_USER_ID}>미지정</option>
                {memberOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    담당 · {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              제품
              <select
                value={productAssignment.product_id}
                onChange={(event) => {
                  const productId = event.target.value
                  const selectedProduct = data.products.find((product) => product.id === productId)
                  setProductAssignment({
                    ...productAssignment,
                    product_id: productId,
                    unassigned_reason: isUnassigned ? selectedProduct?.unassigned_reason ?? '' : '',
                  })
                }}
              >
                <option value="">선택</option>
                {data.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            {isUnassigned && (
              <label className="wide">
                비고 · 담당자 미지정 사유 (선택)
                <textarea
                  maxLength={1000}
                  placeholder="예: 담당 제품군 조정 중"
                  value={productAssignment.unassigned_reason}
                  onChange={(event) =>
                    setProductAssignment({ ...productAssignment, unassigned_reason: event.target.value })
                  }
                />
                <small>{productAssignment.unassigned_reason.length}/1000자</small>
              </label>
            )}
          </>
        }
        onSubmit={onSubmit}
        disabled={!productAssignment.user_id || !productAssignment.product_id}
        submitLabel={isUnassigned ? '미지정으로 저장' : '제품 배정'}
      />
    </Modal>
  )
}
