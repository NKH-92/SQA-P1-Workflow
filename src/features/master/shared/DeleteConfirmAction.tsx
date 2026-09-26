import { useId, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { IconAction } from '../../../components/ui'
import type { AdminDeleteTable, PendingAdminDelete } from '../../../app/types'
import type { AuditedDeleteInput } from '../../../data/contracts'

/**
 * 삭제 확인(사유 필수·감사 기록). 휴지통 버튼을 누르면 그 자리에서 사유를 받고 [닫기] [삭제하기]로 끝낸다.
 * hideTrigger면 휴지통 버튼 없이, 다른 곳(더보기 메뉴 등)에서 pendingDelete를 열었을 때만 확인 칸을 보여준다.
 */
export function DeleteConfirmAction({
  table,
  id,
  expectedUpdatedAt,
  label,
  itemName,
  warning,
  pendingDelete,
  setPendingDelete,
  onConfirm,
  hideTrigger = false,
}: {
  table: AdminDeleteTable
  id: string
  expectedUpdatedAt: string | null | undefined
  label: string
  itemName: string
  /** 삭제하면 함께 사라지는 것과 대신 할 수 있는 일(해요체). features/master/shared/deleteCopy.ts의 문구를 쓴다. */
  warning: string
  pendingDelete: PendingAdminDelete | null
  setPendingDelete: (value: PendingAdminDelete | null) => void
  onConfirm: (input: AuditedDeleteInput) => void
  hideTrigger?: boolean
}) {
  const [reason, setReason] = useState('')
  const [showError, setShowError] = useState(false)
  const reasonId = useId()
  const errorId = useId()
  const selected = pendingDelete?.table === table && pendingDelete.id === id
  if (!selected) {
    if (hideTrigger) return null
    return (
      <IconAction
        title={`${label} 삭제`}
        label={`${itemName} 삭제`}
        onClick={() => {
          setReason('')
          setShowError(false)
          setPendingDelete({ table, id, expectedUpdatedAt: expectedUpdatedAt ?? null })
        }}
      >
        <Trash2 size={16} />
      </IconAction>
    )
  }

  const confirm = () => {
    if (!reason.trim()) {
      setShowError(true)
      document.getElementById(reasonId)?.focus()
      return
    }
    void onConfirm({ expectedUpdatedAt: pendingDelete.expectedUpdatedAt, reason })
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
        <button className="ghost compact" onClick={() => setPendingDelete(null)} type="button">
          닫기
        </button>
        <button className="danger compact" onClick={confirm} type="button">
          삭제하기
        </button>
      </div>
    </div>
  )
}
