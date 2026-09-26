import type { Dispatch, SetStateAction } from 'react'
import { UserRoundCog } from 'lucide-react'
import { FormGrid, Modal } from '../../../components/ui'
import type { AppData, Profile } from '../../../types'
import { selectTransferableProductTasks } from '../master.selectors'

export const UNASSIGNED_PRODUCT_USER_ID = '__unassigned__'

export type ProductAssignmentForm = {
  user_id: string
  product_id: string
  unassigned_reason: string
  transfer_pending_tasks: boolean
  previous_user_id?: string
  expected_updated_at?: string | null
}

export function ProductAssignModal({
  open,
  onClose,
  data,
  memberOptions,
  productAssignment,
  setProductAssignment,
  onSubmit,
  fixedProduct = false,
  submitting = false,
}: {
  open: boolean
  onClose: () => void
  data: AppData
  memberOptions: Profile[]
  productAssignment: ProductAssignmentForm
  setProductAssignment: Dispatch<SetStateAction<ProductAssignmentForm>>
  onSubmit: () => void
  fixedProduct?: boolean
  submitting?: boolean
}) {
  const isUnassigned = productAssignment.user_id === UNASSIGNED_PRODUCT_USER_ID
  const selectedProduct = data.products.find((product) => product.id === productAssignment.product_id)
  const selectedProductAssignments = data.productAssignments.filter(
    (assignment) => assignment.product_id === productAssignment.product_id,
  )
  const currentAssigneeNames = selectedProductAssignments.map(
    (assignment) => assignment.profiles?.name
      ?? data.profiles.find((profile) => profile.id === assignment.user_id)?.name
      ?? '알 수 없는 사용자',
  )
  const transferableTasks = isUnassigned
    ? []
    : selectTransferableProductTasks(data, productAssignment.product_id, productAssignment.user_id)
  const hasAssignments = selectedProductAssignments.length > 0
  const selectedMemberIsAssignable = memberOptions.some((member) => member.id === productAssignment.user_id)
  const initialUserId = productAssignment.previous_user_id ?? (hasAssignments ? '' : UNASSIGNED_PRODUCT_USER_ID)
  const userChanged = productAssignment.user_id !== initialUserId
  const reasonChanged = productAssignment.unassigned_reason.trim() !== (selectedProduct?.unassigned_reason ?? '').trim()
  const dirty = userChanged || (isUnassigned && reasonChanged) || productAssignment.transfer_pending_tasks
  const title = fixedProduct ? (hasAssignments ? '제품 담당자 변경' : '제품 담당자 배정') : '제품 배정'

  const disabledReason = !productAssignment.product_id
    ? '제품을 고르면 저장할 수 있어요.'
    : isUnassigned
      ? '담당자를 없애는 이유를 적으면 저장할 수 있어요.'
      : '담당자를 고르면 저장할 수 있어요.'
  const disabled = !productAssignment.product_id
    || (isUnassigned ? !productAssignment.unassigned_reason.trim() : !selectedMemberIsAssignable)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      titleId="product-assign-title"
      description={fixedProduct && hasAssignments
        ? '새 담당자를 고르면 이 제품의 미적용 업무도 함께 넘길 수 있어요.'
        : undefined}
      eyebrow="제품"
      icon={<UserRoundCog size={18} />}
      closeLabel={`${title} 닫기`}
      dirty={dirty && !submitting}
    >
      <FormGrid
        fields={
          <>
            {fixedProduct && <p className="wide product-assign-subject"><strong>{selectedProduct?.name}</strong></p>}
            {fixedProduct && selectedProductAssignments.length > 1 && <label>
              변경할 기존 담당자
              <select value={productAssignment.previous_user_id ?? ''} onChange={(event) => setProductAssignment({
                ...productAssignment,
                previous_user_id: event.target.value,
                user_id: event.target.value,
                transfer_pending_tasks: false,
              })}>
                {selectedProductAssignments.map((assignment, index) => <option key={assignment.id} value={assignment.user_id}>{currentAssigneeNames[index]}</option>)}
              </select>
            </label>}
            <label>
              담당자
              <select
                aria-label="담당자"
                value={productAssignment.user_id}
                onChange={(event) => {
                  const userId = event.target.value
                  setProductAssignment({
                    ...productAssignment,
                    user_id: userId,
                    transfer_pending_tasks: false,
                    unassigned_reason:
                      userId === UNASSIGNED_PRODUCT_USER_ID ? selectedProduct?.unassigned_reason ?? '' : '',
                  })
                }}
              >
                {!fixedProduct && <option value="">선택</option>}
                {fixedProduct && productAssignment.user_id === '' && <option disabled value="">담당자를 골라 주세요</option>}
                <option value={UNASSIGNED_PRODUCT_USER_ID}>담당자 없음</option>
                {productAssignment.user_id && !isUnassigned && !selectedMemberIsAssignable && (
                  <option value={productAssignment.user_id} disabled>
                    {data.profiles.find((member) => member.id === productAssignment.user_id)?.name ?? '알 수 없는 사용자'} (비활성 계정)
                  </option>
                )}
                {memberOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            {!fixedProduct && <label>
              제품
              <select
                value={productAssignment.product_id}
                onChange={(event) => {
                  const productId = event.target.value
                  const product = data.products.find((item) => item.id === productId)
                  setProductAssignment({
                    ...productAssignment,
                    product_id: productId,
                    transfer_pending_tasks: false,
                    unassigned_reason: isUnassigned ? product?.unassigned_reason ?? '' : '',
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
            </label>}
            {isUnassigned && (
              <label className="wide">
                담당자를 없애는 이유
                <textarea
                  aria-required="true"
                  maxLength={500}
                  placeholder="예: 담당 제품군 조정 중"
                  value={productAssignment.unassigned_reason}
                  onChange={(event) =>
                    setProductAssignment({ ...productAssignment, unassigned_reason: event.target.value })
                  }
                />
                <small>제품 카드의 비고와 변경 기록에 남아요 · {productAssignment.unassigned_reason.length}/500자</small>
              </label>
            )}
            {!isUnassigned && productAssignment.product_id && productAssignment.user_id && (
              <div className="wide product-transfer-preview">
                <p>
                  <span>현재 담당자 <strong>{currentAssigneeNames.join(', ') || '없음'}</strong></span>
                  <span>미완료 적용 업무 <strong>{transferableTasks.length}건</strong></span>
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
                      미완료 적용 업무도 새 담당자에게 넘기기
                      <small>여기 보이는 {transferableTasks.length}건만 함께 넘어가요. 완료한 기록은 그대로예요.</small>
                    </span>
                  </label>
                )}
              </div>
            )}
          </>
        }
        onSubmit={onSubmit}
        onCancel={onClose}
        disabled={disabled}
        disabledReason={disabledReason}
        submitting={submitting}
        submitLabel={isUnassigned ? '담당자 없이 저장하기' : fixedProduct ? '담당자 저장하기' : '제품 배정하기'}
      />
    </Modal>
  )
}
