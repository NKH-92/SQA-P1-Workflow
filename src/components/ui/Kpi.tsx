import type { ReactNode } from 'react'

export function Kpi({ label, value, icon }: { label: string; value: number; icon?: ReactNode }) {
  return (
    <div className="kpi">
      {icon && <div className="kpi-icon">{icon}</div>}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
