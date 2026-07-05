import { describe, expect, it } from 'vitest'
import { toUserMessage } from './errors'

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

  it('maps network failures', () => {
    expect(toUserMessage(new TypeError('Failed to fetch'))).toBe(
      '서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.',
    )
  })

  it('maps generic Error to fallback when unknown', () => {
    expect(toUserMessage(new Error('something unexpected'))).toBe('something unexpected')
  })

  it('maps unknown values to generic fallback', () => {
    expect(toUserMessage(null)).toBe('작업을 완료하지 못했습니다. 문제가 반복되면 관리자에게 문의하세요.')
  })
})
