import type { Dispatch, SetStateAction } from 'react'
import { Users } from 'lucide-react'
import { FormGrid, Modal } from '../../../components/ui'
import type { AppData, Profile } from '../../../types'

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
  productAssignment: { user_id: string; product_id: string }
  setProductAssignment: Dispatch<SetStateAction<{ user_id: string; product_id: string }>>
  onSubmit: () => void
}) {
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
              파트원
              <select
                value={productAssignment.user_id}
                onChange={(event) => setProductAssignment({ ...productAssignment, user_id: event.target.value })}
              >
                <option value="">선택</option>
                {memberOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              제품
              <select
                value={productAssignment.product_id}
                onChange={(event) => setProductAssignment({ ...productAssignment, product_id: event.target.value })}
              >
                <option value="">선택</option>
                {data.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
        onSubmit={onSubmit}
        disabled={!productAssignment.user_id || !productAssignment.product_id}
        submitLabel="제품 배정"
      />
    </Modal>
  )
}
