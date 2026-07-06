import { Trash2 } from 'lucide-react'
import { IconAction } from '../../../components/ui'
import { deleteWarnings } from '../../../app/constants'
import type { AdminDeleteTable } from '../../../app/types'

export function DeleteConfirmAction({
  table,
  id,
  label,
  itemName,
  warning,
  pendingDelete,
  setPendingDelete,
  onConfirm,
}: {
  table: AdminDeleteTable
  id: string
  label: string
  itemName: string
  warning?: string
  pendingDelete: { table: AdminDeleteTable; id: string } | null
  setPendingDelete: (value: { table: AdminDeleteTable; id: string } | null) => void
  onConfirm: () => void
}) {
  const selected = pendingDelete?.table === table && pendingDelete.id === id
  if (!selected) {
    return (
      <IconAction title={`${label} 삭제`} onClick={() => setPendingDelete({ table, id })}>
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
      <div className="inline-actions">
        <button className="danger compact" onClick={() => void onConfirm()} type="button">
          삭제 확인
        </button>
        <button className="ghost compact" onClick={() => setPendingDelete(null)} type="button">
          취소
        </button>
      </div>
    </div>
  )
}
