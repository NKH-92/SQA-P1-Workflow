import type { Role } from '../types'
import { UserFacingError } from './errors'

export function normalizeCsvImportedValue(value: string) {
  const trimmed = value.trim()
  if (trimmed.startsWith("'") && trimmed.length > 1 && /^[=+\-@]/.test(trimmed.slice(1))) {
    return trimmed.slice(1)
  }
  return trimmed
}

export function parseCsvRows(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    const next = normalized[index + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === ',') {
      row.push(normalizeCsvImportedValue(cell))
      cell = ''
      continue
    }
    if (char === '\n' || char === '\r') {
      row.push(normalizeCsvImportedValue(cell))
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      cell = ''
      if (char === '\r' && next === '\n') index += 1
      continue
    }
    cell += char
  }

  row.push(normalizeCsvImportedValue(cell))
  if (row.some((value) => value.length > 0)) rows.push(row)
  return rows
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '_')
}

export function parseProductImportRows(rows: string[][]) {
  if (rows.length === 0) return []
  const [header, ...body] = rows
  const indexes = {
    category: header.findIndex((value) => ['category', 'type', '구분'].includes(normalizeHeader(value))),
    name: header.findIndex((value) => ['name', '제품명', 'product'].includes(normalizeHeader(value))),
    companyName: header.findIndex((value) => ['company', 'company_name', '회사명', '위탁사명'].includes(normalizeHeader(value))),
  }
  if (indexes.name < 0) {
    if (rows.some((cells) => cells.slice(1).some((value) => value.trim().length > 0))) {
      throw new UserFacingError('첫 줄에 제목 행이 없으면 제품명 한 열만 쓸 수 있어요. 첫 줄에 “제품명”, “구분” 같은 제목을 넣어 주세요.')
    }
    return rows.map((cells) => ({ name: cells[0]?.trim() ?? '' }))
  }
  if (header.length === 1 && rows.length > 1) {
    throw new UserFacingError(
      '첫 줄이 제목인지 제품명인지 알 수 없어요. 첫 줄에 “제품명”, “구분” 같은 제목을 넣어 다시 가져와 주세요.',
    )
  }
  return body.map((cells) => ({
    name: cells[indexes.name]?.trim() ?? '',
    category: indexes.category >= 0 ? cells[indexes.category]?.trim() ?? '' : undefined,
    companyName: indexes.companyName >= 0 ? cells[indexes.companyName]?.trim() ?? '' : undefined,
  }))
}

export function parseInviteImportRows(rows: string[][]) {
  if (rows.length === 0) return []
  const [header, ...body] = rows
  const indexes = {
    email: header.findIndex((value) => ['email', '이메일'].includes(normalizeHeader(value))),
    name: header.findIndex((value) => ['name', '이름'].includes(normalizeHeader(value))),
    role: header.findIndex((value) => ['role', '역할'].includes(normalizeHeader(value))),
  }
  const parseRole = (value: string): { role: Role; invalidRole?: string } => {
    const trimmed = value.trim()
    const normalized = trimmed.toLowerCase()
    if (normalized === 'leader' || trimmed === '파트장') return { role: 'leader' }
    if (normalized === 'team_leader' || trimmed === '팀장') return { role: 'team_leader' }
    if (!trimmed || normalized === 'member' || trimmed === '파트원') return { role: 'member' }
    return { role: 'member', invalidRole: trimmed }
  }

  if (indexes.email < 0) {
    return rows.map((cells) => ({
      email: cells[0]?.trim().toLowerCase() ?? '',
      name: cells[1]?.trim() ?? '',
      ...parseRole(cells[2] ?? 'member'),
    }))
  }

  return body.map((cells) => ({
    email: cells[indexes.email]?.trim().toLowerCase() ?? '',
    name: cells[indexes.name >= 0 ? indexes.name : 1]?.trim() ?? '',
    ...parseRole(indexes.role >= 0 ? cells[indexes.role] ?? 'member' : 'member'),
  }))
}
