import { readFileSync } from 'node:fs'

export function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`)
    }
    args[key] = value
    index += 1
  }
  return args
}

export function readCsvRows(path) {
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map((cell) => cell.trim())
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(',').map((cell) => cell.trim())
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))
  })
  return { headers, rows }
}

export function readProfileMap(path) {
  const raw = readFileSync(path, 'utf8')
  const parsed = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('profile map must be a JSON object')
  }
  return parsed
}

export function esc(value) {
  return String(value).replace(/'/g, "''")
}
