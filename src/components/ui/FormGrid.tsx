import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'

export function FormGrid({
  fields,
  submitLabel,
  disabled,
  onSubmit,
}: {
  fields: ReactNode
  submitLabel: string
  disabled: boolean
  onSubmit: () => void
}) {
  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit()
      }}
    >
      {fields}
      <button className="primary wide" disabled={disabled} type="submit">
        <Plus size={16} />
        {submitLabel}
      </button>
    </form>
  )
}
