import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { IconAction } from '../../../components/ui'
import { deleteWarnings } from '../../../app/constants'
import type { AdminDeleteTable, PendingAdminDelete } from '../../../app/types'
import type { AuditedDeleteInput } from '../../../data/contracts'

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
}: {
  table: AdminDeleteTable
  id: string
  expectedUpdatedAt: string | null | undefined
  label: string
  itemName: string
  warning?: string
  pendingDelete: PendingAdminDelete | null
  setPendingDelete: (value: PendingAdminDelete | null) => void
  onConfirm: (input: AuditedDeleteInput) => void
}) {
  const [reason, setReason] = useState('')
  const selected = pendingDelete?.table === table && pendingDelete.id === id
  if (!selected) {
    return (
      <IconAction
        title={`${label} 삭제`}
        onClick={() => {
          setReason('')
          setPendingDelete({ table, id, expectedUpdatedAt: expectedUpdatedAt ?? null })
        }}
      >
        <Trash2 size={16} />
      </IconAction>
    )
  }

  return (
    <div className="delete-confirm expanded">
      <p className="draft-notice">{warning ?? deleteWarnings[table]}</p>
      <p>
        <strong>{itemName}</strong>
      </p>
      <label className="wide">
        삭제 사유
        <textarea
          aria-label="삭제 사유"
          maxLength={500}
          placeholder="예: 중복 등록된 항목을 정리합니다."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <small>{reason.length}/500자</small>
      </label>
      <div className="inline-actions">
        <button
          className="danger compact"
          disabled={!reason.trim()}
          onClick={() => void onConfirm({ expectedUpdatedAt: pendingDelete.expectedUpdatedAt, reason })}
          type="button"
        >
          삭제 확인
        </button>
        <button
          className="ghost compact"
          onClick={() => setPendingDelete(null)}
          type="button"
        >
          취소
        </button>
      </div>
    </div>
  )
}
