import { describe, expect, it } from 'vitest'
import { readChangeProductImportFile } from './productImportFile'

describe('readChangeProductImportFile', () => {
  it('reads UTF-8 CSV product names', async () => {
    const file = new File(['﻿제품명\n모델A'], '적용제품.csv', { type: 'text/csv' })

    await expect(readChangeProductImportFile(file)).resolves.toEqual({
      fileName: '적용제품.csv',
      sheetName: null,
      rows: [{ rowNumber: 2, name: '모델A' }],
    })
  })

  it('reads a Korean Excel "CSV (comma delimited)" file saved as CP949', async () => {
    // CP949로 저장한 "제품명\n모델A"
    const cp949 = Uint8Array.from([0xc1, 0xa6, 0xc7, 0xb0, 0xb8, 0xed, 0x0a, 0xb8, 0xf0, 0xb5, 0xa8, 0x41])
    const file = new File([cp949], '적용제품.csv', { type: 'text/csv' })

    await expect(readChangeProductImportFile(file)).resolves.toMatchObject({
      rows: [{ rowNumber: 2, name: '모델A' }],
    })
  })
})
