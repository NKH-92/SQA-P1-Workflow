export type CsvImportIssue = {
  value: string
  reason: string
}

export function ImportDiagnostics({
  id,
  subject,
  issues,
  onClose,
}: {
  id: string
  subject: string
  issues: CsvImportIssue[]
  onClose: () => void
}) {
  if (issues.length === 0) return null

  return (
    <section aria-labelledby={id} className="import-diagnostics">
      <header>
        <div role="status">
          <strong id={id}>가져오지 않은 {subject} {issues.length}건</strong>
          <span>값을 수정한 뒤 CSV를 다시 가져오세요.</span>
        </div>
        <button className="ghost compact" onClick={onClose} type="button">결과 닫기</button>
      </header>
      <ul>
        {issues.map((issue, index) => (
          <li key={`${issue.value}-${index}`}>
            <strong>{issue.value}</strong>
            <span>{issue.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
