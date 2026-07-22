import type { ReactNode } from 'react'

export type DashboardMetric = {
  label: string
  value: number
  unit: string
  note: string
  icon: ReactNode
  tone?: 'warning' | 'urgent' | 'success'
  onOpen: () => void
}

export function DashboardMetricStrip({
  label,
  metrics,
  className = '',
}: {
  label: string
  metrics: readonly DashboardMetric[]
  className?: string
}) {
  return (
    <div className={`kpi-strip dashboard-kpi-strip ${className}`} aria-label={label}>
      {metrics.map((metric) => (
        <button
          aria-label={`${metric.label}${metric.value}${metric.unit}`}
          className="kpi-stat"
          data-tone={metric.tone}
          key={metric.label}
          onClick={metric.onOpen}
          type="button"
        >
          <span className="kpi-stat-label">{metric.label}{metric.icon}</span>
          <strong className="kpi-stat-value">{metric.value}<span className="unit">{metric.unit}</span></strong>
          <small className="kpi-stat-note" aria-hidden="true">{metric.note}</small>
        </button>
      ))}
    </div>
  )
}
