import readXlsxFile from 'read-excel-file/browser'
import { parseCsvRows } from '../../lib/csvImport'
import { UserFacingError } from '../../lib/errors'
import {
  MAX_CHANGE_PRODUCT_IMPORT_BYTES,
  MAX_CHANGE_PRODUCT_IMPORT_ROWS,
  type ImportedProductNameRow,
} from './productImport'

const PRODUCT_HEADERS = new Set(['제품명', 'name', 'product', 'product_name'])

type CellValue = string | number | boolean | Date | null

function normalizeHeader(value: CellValue) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('ko').replace(/\s+/g, '_')
}

export function extractImportedProductNames(rows: CellValue[][]): ImportedProductNameRow[] {
  const firstContentIndex = rows.findIndex((row) => row.some((cell) => String(cell ?? '').trim()))
  if (firstContentIndex < 0) return []

  const firstRow = rows[firstContentIndex]
  const headerIndex = firstRow.findIndex((cell) => PRODUCT_HEADERS.has(normalizeHeader(cell)))
  const dataStartIndex = headerIndex >= 0 ? firstContentIndex + 1 : firstContentIndex
  const productColumnIndex = headerIndex >= 0 ? headerIndex : 0

  if (
    headerIndex < 0
    && rows.slice(firstContentIndex).some((row) => row.slice(1).some((cell) => String(cell ?? '').trim()))
  ) {
    throw new UserFacingError('헤더 없는 파일은 제품명 한 열만 사용할 수 있습니다.')
  }

  const parsed = rows
    .slice(dataStartIndex)
    .map((row, index) => ({
      rowNumber: dataStartIndex + index + 1,
      name: String(row[productColumnIndex] ?? '').normalize('NFKC').trim(),
    }))
    .filter((row) => row.name.length > 0)

  if (parsed.length > MAX_CHANGE_PRODUCT_IMPORT_ROWS) {
    throw new UserFacingError(`한 번에 최대 ${MAX_CHANGE_PRODUCT_IMPORT_ROWS.toLocaleString('ko-KR')}개 제품까지 가져올 수 있습니다.`)
  }
  return parsed
}

export type ProductImportFileResult = {
  fileName: string
  sheetName: string | null
  rows: ImportedProductNameRow[]
}

export async function readChangeProductImportFile(file: File): Promise<ProductImportFileResult> {
  if (file.size > MAX_CHANGE_PRODUCT_IMPORT_BYTES) {
    throw new UserFacingError('가져오기 파일은 2MB 이하여야 합니다.')
  }

  const extension = file.name.split('.').pop()?.toLocaleLowerCase('en')
  if (extension === 'csv') {
    const rows = parseCsvRows(await file.text())
    return {
      fileName: file.name,
      sheetName: null,
      rows: extractImportedProductNames(rows),
    }
  }
  if (extension !== 'xlsx') {
    throw new UserFacingError('.xlsx 또는 .csv 파일만 가져올 수 있습니다.')
  }

  let sheets
  try {
    sheets = await readXlsxFile(file)
  } catch {
    throw new UserFacingError('Excel 파일을 읽을 수 없습니다. 파일이 손상되지 않았는지 확인해 주세요.')
  }
  const preferred = sheets.find((sheet) => sheet.sheet.trim() === '적용대상')
  const selected = preferred ?? sheets.find((sheet) => sheet.data.some((row) => row.some((cell) => cell != null)))
  if (!selected) throw new UserFacingError('제품명이 입력된 시트를 찾지 못했습니다.')

  return {
    fileName: file.name,
    sheetName: selected.sheet,
    rows: extractImportedProductNames(selected.data as CellValue[][]),
  }
}
