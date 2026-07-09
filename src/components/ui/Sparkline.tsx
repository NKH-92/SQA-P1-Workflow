/**
 * 월별 제출/완료 추이를 보여주는 미니 라인 차트.
 * 값이 없거나 모두 0이면 렌더하지 않는다(빈 축만 그리면 오히려 오해를 준다).
 */
export function Sparkline({
  submitted,
  approved,
  width = 520,
  height = 60,
}: {
  submitted: number[]
  approved: number[]
  width?: number
  height?: number
}) {
  if (submitted.length < 2) return null
  const max = Math.max(1, ...submitted, ...approved)
  const stepX = width / (submitted.length - 1)
  const toY = (value: number) => height - (value / max) * (height - 8) - 4
  const toPath = (values: number[]) =>
    values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${index * stepX} ${toY(value)}`).join(' ')
  const toArea = (values: number[]) =>
    `${toPath(values)} L ${width} ${height} L 0 ${height} Z`

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-hidden="true">
      <path d={toArea(submitted)} fill="var(--paper-accent)" fillOpacity="0.08" stroke="none" />
      <path d={toPath(submitted)} fill="none" stroke="var(--paper-accent)" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
      <path d={toPath(approved)} fill="none" stroke="var(--paper-done)" strokeWidth="1.75" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
