import { useId, useState } from 'react'
import type { AuditedDeleteInput } from '../../../data/contracts'

/** 삭제 확인을 열 때만 마운트하여 닫은 창의 사유나 오류를 다음 확인에 남기지 않는다. */
export function DeleteConfirmAction({
  expectedUpdatedAt,
  itemName,
  warning,
  onClose,
  onConfirm,
}: {
  expectedUpdatedAt: AuditedDeleteInput['expectedUpdatedAt']
  itemName: string
  /** 삭제하면 함께 사라지는 것과 대신 할 수 있는 일(해요체). features/master/shared/deleteCopy.ts의 문구를 쓴다. */
  warning: string
  onClose: () => void
  onConfirm: (input: AuditedDeleteInput) => void
}) {
  const [reason, setReason] = useState('')
  const [showError, setShowError] = useState(false)
  const reasonId = useId()
  const errorId = useId()
  const confirm = () => {
    if (!reason.trim()) {
      setShowError(true)
      document.getElementById(reasonId)?.focus()
      return
    }
    void onConfirm({ expectedUpdatedAt, reason })
  }

  return (
    <div className="delete-confirm expanded" role="group" aria-label={`${itemName} 삭제 확인`}>
      <p className="draft-notice">{warning}</p>
      <p>
        <strong>{itemName}</strong>
      </p>
      <label className="wide" htmlFor={reasonId}>
        삭제 사유
        <textarea
          aria-describedby={showError ? errorId : undefined}
          aria-invalid={showError || undefined}
          aria-label="삭제 사유"
          autoFocus
          id={reasonId}
          maxLength={500}
          placeholder="예: 중복으로 등록된 항목 정리"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            if (event.target.value.trim()) setShowError(false)
          }}
        />
        <small>{reason.length}/500자</small>
        {showError && <p className="field-error" id={errorId}>삭제 사유를 적어 주세요. 사유는 감사 이력에 남아요.</p>}
      </label>
      <div className="inline-actions delete-confirm-actions">
        <button className="ghost compact" onClick={onClose} type="button">
          닫기
        </button>
        <button className="danger compact" onClick={confirm} type="button">
          삭제하기
        </button>
      </div>
    </div>
  )
}
