import { describe, expect, it } from 'vitest'
import { assertAffectedRows, assertRecordExists, toErrorCode, toUserMessage, UserFacingError } from './errors'

describe('toUserMessage', () => {
  it('maps duplicate key code 23505', () => {
    expect(toUserMessage({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(
      '이미 등록된 항목이에요. 목록에서 확인해 주세요.',
    )
  })

  it('maps foreign key code 23503', () => {
    expect(toUserMessage({ code: '23503', message: 'insert or update on table violates foreign key' })).toBe(
      '연결된 데이터가 있어서 처리할 수 없어요. 연결을 먼저 정리해 주세요.',
    )
  })

  it('maps RLS code 42501', () => {
    expect(toUserMessage({ code: '42501', message: 'permission denied for table profiles' })).toBe('이 작업을 할 권한이 없어요. 필요하면 파트장에게 요청해 주세요.')
  })

  it('maps invalid input code 22P02', () => {
    expect(toUserMessage({ code: '22P02', message: 'invalid input syntax for type uuid' })).toBe(
      '입력한 값의 형식을 확인해 주세요.',
    )
  })

  it('maps check constraint code 23514', () => {
    expect(toUserMessage({ code: '23514', message: 'new row violates check constraint' })).toBe(
      '입력한 값이 조건에 맞지 않아요. 내용을 확인해 주세요.',
    )
  })

  it('maps network failures', () => {
    expect(toUserMessage(new TypeError('Failed to fetch'))).toBe(
      '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
    )
  })

  it('maps generic Error to fallback when unknown', () => {
    expect(toUserMessage(new Error('something unexpected'))).toBe(
      '요청을 처리하지 못했어요. 다시 시도해도 안 되면 관리자에게 알려 주세요.',
    )
  })

  it('maps unknown values to generic fallback', () => {
    expect(toUserMessage(null)).toBe('요청을 처리하지 못했어요. 다시 시도해도 안 되면 관리자에게 알려 주세요.')
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
