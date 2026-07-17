import type { Dispatch, SetStateAction } from 'react'
import { Users } from 'lucide-react'
import { FormGrid, Modal } from '../../../components/ui'
import type { AppData, Profile } from '../../../types'
import { selectProductChangeTaskContexts } from '../../change-applications/selectors'

export const UNASSIGNED_PRODUCT_USER_ID = '__unassigned__'

export type ProductAssignmentForm = {
  user_id: string
  product_id: string
  unassigned_reason: string
  transfer_pending_tasks: boolean
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
  const selectedProductAssignments = data.productAssignments.filter(
    (assignment) => assignment.product_id === productAssignment.product_id,
  )
  const currentAssigneeNames = selectedProductAssignments.map(
    (assignment) => assignment.profiles?.name
      ?? data.profiles.find((profile) => profile.id === assignment.user_id)?.name
      ?? assignment.user_id,
  )
  const transferableTasks = productAssignment.user_id && !isUnassigned
    ? selectProductChangeTaskContexts(data).filter(
        ({ task, application }) =>
          task.product_id === productAssignment.product_id
          && task.status === 'pending'
          && task.assignee_id !== productAssignment.user_id
          && application.status === 'published',
      )
    : []

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
                    transfer_pending_tasks: false,
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
                    transfer_pending_tasks: false,
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
            {!isUnassigned && productAssignment.product_id && productAssignment.user_id && (
              <div className="wide product-transfer-preview">
                <p>
                  현재 담당 <strong>{currentAssigneeNames.join(', ') || '미지정'}</strong>
                  <span>미완료 변경 적용업무 <strong>{transferableTasks.length}건</strong></span>
                </p>
                {transferableTasks.length > 0 && (
                  <label className="product-transfer-option">
                    <input
                      checked={productAssignment.transfer_pending_tasks}
                      onChange={(event) => setProductAssignment({
                        ...productAssignment,
                        transfer_pending_tasks: event.target.checked,
                      })}
                      type="checkbox"
                    />
                    <span>
                      미완료 적용업무도 새 담당자에게 이관
                      <small>확인한 {transferableTasks.length}건만 함께 이관되며 완료 이력은 바뀌지 않습니다.</small>
                    </span>
                  </label>
                )}
              </div>
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
