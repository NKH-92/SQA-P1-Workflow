import { describe, expect, it } from 'vitest'
import { parseCsvRows, parseInviteImportRows, parseProductImportRows } from './csvImport'

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
})
