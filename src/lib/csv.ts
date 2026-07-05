export function csvCell(value: unknown) {
  const text = value == null ? '' : String(value)
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safeText.replace(/"/g, '""')}"`
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (typeof document === 'undefined') return
  const headers = Array.from(
    rows.reduce((keys, row) => {
      Object.keys(row).forEach((key) => keys.add(key))
      return keys
    }, new Set<string>()),
  )
  const body = rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))
  const csv = `\uFEFF${headers.join(',')}\n${body.join('\n')}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
