import { describe, expect, it } from 'vitest'
import { parseCsvRows, parseInviteImportRows, parseProductImportRows, readCsvFileText } from './csvImport'
import { UserFacingError } from './errors'

describe('readCsvFileText', () => {
  it('reads UTF-8 files (with or without BOM) as UTF-8', async () => {
    const withBom = new TextEncoder().encode('﻿제품명\n모델A')
    const withoutBom = new TextEncoder().encode('제품명\n모델A')
    expect(parseCsvRows(await readCsvFileText(new Blob([withBom])))).toEqual([['제품명'], ['모델A']])
    expect(parseCsvRows(await readCsvFileText(new Blob([withoutBom])))).toEqual([['제품명'], ['모델A']])
  })

  it('falls back to EUC-KR for Korean Excel "CSV (comma delimited)" files', async () => {
    // "제품명\n모델A" in CP949
    const cp949 = Uint8Array.from([0xc1, 0xa6, 0xc7, 0xb0, 0xb8, 0xed, 0x0a, 0xb8, 0xf0, 0xb5, 0xa8, 0x41])
    const text = await readCsvFileText(new Blob([cp949]))
    expect(text).toBe('제품명\n모델A')
    expect(parseCsvRows(text)).toEqual([['제품명'], ['모델A']])
  })
})

describe('csvImport', () => {
  it('parses quoted csv rows', () => {
    expect(parseCsvRows('name,code\n"Alpha","A-1"')).toEqual([
      ['name', 'code'],
      ['Alpha', 'A-1'],
    ])
  })

  it('parses product rows with headers', () => {
    expect(parseProductImportRows(parseCsvRows('제품명,제품코드\n모델A,A01'))).toEqual([{ name: '모델A' }])
    expect(parseProductImportRows(parseCsvRows('구분,제품명,담당자명,위탁사명\n위탁,모델B,담당자,위탁사'))).toEqual([
      { name: '모델B', category: '위탁', companyName: '위탁사' },
    ])
  })

  it('parses invite rows', () => {
    expect(parseInviteImportRows(parseCsvRows('email,name,role\na@example.com,홍길동,member'))).toEqual([
      { email: 'a@example.com', name: '홍길동', role: 'member' },
    ])
  })

  it('preserves the first product row when the CSV has no header', () => {
    expect(parseProductImportRows(parseCsvRows('모델A\n모델B'))).toEqual([
      { name: '모델A' },
      { name: '모델B' },
    ])
  })

  it('rejects ambiguous multi-column product CSV files without a header', () => {
    expect(() => parseProductImportRows(parseCsvRows('자사,모델A\n위탁,모델B'))).toThrow(UserFacingError)
  })

  it('rejects an ambiguous one-column file whose first product is a header keyword', () => {
    expect(() => parseProductImportRows(parseCsvRows('product\nModel B'))).toThrow(UserFacingError)
  })

  it('preserves the first invite row when the CSV has no header', () => {
    expect(parseInviteImportRows(parseCsvRows('a@example.com,홍길동,member\nb@example.com,김파트장,leader'))).toEqual([
      { email: 'a@example.com', name: '홍길동', role: 'member' },
      { email: 'b@example.com', name: '김파트장', role: 'leader' },
    ])
  })

  it('treats CR-only line endings as row boundaries', () => {
    expect(parseCsvRows('name,code\rAlpha,A-1\rBeta,B-1')).toEqual([
      ['name', 'code'],
      ['Alpha', 'A-1'],
      ['Beta', 'B-1'],
    ])
  })
})
