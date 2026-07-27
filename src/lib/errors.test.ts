import { describe, expect, it } from 'vitest'
import { assertAffectedRows, assertRecordExists, toErrorCode, toUserMessage, UserFacingError } from './errors'

describe('toUserMessage', () => {
  it('maps duplicate key code 23505', () => {
    expect(toUserMessage({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(
      '이미 등록된 항목입니다.',
    )
  })

  it('maps foreign key code 23503', () => {
    expect(toUserMessage({ code: '23503', message: 'insert or update on table violates foreign key' })).toBe(
      '연결된 데이터가 있어 처리할 수 없습니다.',
    )
  })

  it('maps RLS code 42501', () => {
    expect(toUserMessage({ code: '42501', message: 'permission denied for table profiles' })).toBe('권한이 없습니다.')
  })

  it('maps invalid input code 22P02', () => {
    expect(toUserMessage({ code: '22P02', message: 'invalid input syntax for type uuid' })).toBe(
      '입력 형식이 올바르지 않습니다.',
    )
  })

  it('maps check constraint code 23514', () => {
    expect(toUserMessage({ code: '23514', message: 'new row violates check constraint' })).toBe(
      '입력값이 조건을 만족하지 않습니다.',
    )
  })

  it('maps network failures', () => {
    expect(toUserMessage(new TypeError('Failed to fetch'))).toBe(
      '서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.',
    )
  })

  it('maps generic Error to fallback when unknown', () => {
    expect(toUserMessage(new Error('something unexpected'))).toBe(
      '작업을 완료하지 못했습니다. 문제가 반복되면 관리자에게 문의하세요.',
    )
  })

  it('maps unknown values to generic fallback', () => {
    expect(toUserMessage(null)).toBe('작업을 완료하지 못했습니다. 문제가 반복되면 관리자에게 문의하세요.')
  })

  it('preserves UserFacingError messages', () => {
    expect(toUserMessage(new UserFacingError('제목과 설명을 입력해 주세요.'))).toBe('제목과 설명을 입력해 주세요.')
  })
})

describe('mutation result guards', () => {
  it('rejects missing local records and zero-row remote results', () => {
    expect(() => assertRecordExists(undefined)).toThrow(UserFacingError)
    expect(() => assertAffectedRows([])).toThrow(UserFacingError)
    expect(() => assertAffectedRows(null)).toThrow(UserFacingError)
  })

  it('accepts an existing record or at least one affected row', () => {
    expect(() => assertRecordExists({ id: '1' })).not.toThrow()
    expect(() => assertAffectedRows([{ id: '1' }])).not.toThrow()
  })
})

describe('toErrorCode', () => {
  it('preserves the allowlisted bootstrap schema mismatch code', () => {
    expect(toErrorCode(Object.assign(new Error('schema mismatch'), {
      detail: 'SQA_BOOTSTRAP_SCHEMA_MISMATCH',
    }))).toBe('SQA_BOOTSTRAP_SCHEMA_MISMATCH')
  })

  it('does not expose arbitrary error detail text', () => {
    expect(toErrorCode(Object.assign(new Error('private failure'), {
      detail: 'user@example.com review body',
    }))).toBe('unknown')
  })
})
