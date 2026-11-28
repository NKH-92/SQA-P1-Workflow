import type { Dispatch, SetStateAction } from 'react'
import { UserRoundCog } from 'lucide-react'
import { FormGrid, Modal } from '../../../components/ui'
import type { AppData, ProductAssignment, Profile } from '../../../types'
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
  onClose,
  data,
  assignments,
  profilesById,
  memberOptions,
  productAssignment,
  setProductAssignment,
  onSubmit,
  submitting = false,
}: {
  onClose: () => void
  data: AppData
  assignments: readonly ProductAssignment[]
  profilesById: ReadonlyMap<string, Profile>
  memberOptions: Profile[]
  productAssignment: ProductAssignmentForm
  setProductAssignment: Dispatch<SetStateAction<ProductAssignmentForm>>
  onSubmit: () => void
  submitting?: boolean
}) {
  const isUnassigned = productAssignment.user_id === UNASSIGNED_PRODUCT_USER_ID
  const selectedProduct = data.products.find((product) => product.id === productAssignment.product_id)
  const currentAssigneeNames = assignments.map(
    (assignment) => assignment.profiles?.name
      ?? profilesById.get(assignment.user_id)?.name
      ?? '알 수 없는 사용자',
  )
  const transferCount = isUnassigned ? 0 : selectTransferableProductTasks(data, productAssignment.product_id, productAssignment.user_id).length
  const hasAssignments = assignments.length > 0
  const selectedMemberIsAssignable = memberOptions.some((member) => member.id === productAssignment.user_id)
  const initialUserId = productAssignment.previous_user_id ?? (hasAssignments ? '' : UNASSIGNED_PRODUCT_USER_ID)
  const userChanged = productAssignment.user_id !== initialUserId
  const reasonChanged = productAssignment.unassigned_reason.trim() !== (selectedProduct?.unassigned_reason ?? '').trim()
  const dirty = userChanged || (isUnassigned && reasonChanged) || productAssignment.transfer_pending_tasks
  const title = hasAssignments ? '제품 담당자 변경' : '제품 담당자 배정'

  const disabledReason = isUnassigned
    ? '담당자를 없애는 이유를 적으면 저장할 수 있어요.'
    : '담당자를 고르면 저장할 수 있어요.'
  const disabled = isUnassigned ? !productAssignment.unassigned_reason.trim() : !selectedMemberIsAssignable

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      titleId="product-assign-title"
      description={hasAssignments
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
            <p className="wide product-assign-subject"><strong>{selectedProduct?.name}</strong></p>
            {assignments.length > 1 && <label>
              변경할 기존 담당자
              <select value={productAssignment.previous_user_id ?? ''} onChange={(event) => setProductAssignment({
                ...productAssignment,
                previous_user_id: event.target.value,
                user_id: event.target.value,
                transfer_pending_tasks: false,
              })}>
                {assignments.map((assignment, index) => <option key={assignment.id} value={assignment.user_id}>{currentAssigneeNames[index]}</option>)}
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
                <option value={UNASSIGNED_PRODUCT_USER_ID}>담당자 없음</option>
                {!isUnassigned && !selectedMemberIsAssignable && (
                  <option value={productAssignment.user_id} disabled>
                    {profilesById.get(productAssignment.user_id)?.name ?? '알 수 없는 사용자'} (비활성 계정)
                  </option>
                )}
                {memberOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
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
            {!isUnassigned && (
              <div className="wide product-transfer-preview">
                <p>
                  <span>현재 담당자 <strong>{currentAssigneeNames.join(', ') || '없음'}</strong></span>
                  <span>미완료 적용 업무 <strong>{transferCount}건</strong></span>
                </p>
                {transferCount > 0 && (
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
                      <small>여기 보이는 {transferCount}건만 함께 넘어가요. 완료한 기록은 그대로예요.</small>
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
        submitLabel={isUnassigned ? '담당자 없이 저장하기' : '담당자 저장하기'}
      />
    </Modal>
  )
}
