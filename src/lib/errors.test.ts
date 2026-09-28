import { describe, expect, it } from 'vitest'
import {
  assertAffectedRows,
  assertRecordExists,
  errorDetailText,
  isAbortError,
  isChunkLoadError,
  isNetworkError,
  toErrorCode,
  toUserMessage,
  UserFacingError,
} from './errors'

const NETWORK_MESSAGE = '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'
const GENERIC_MESSAGE = '요청을 처리하지 못했어요. 다시 시도해도 안 되면 관리자에게 알려 주세요.'
const APP_UPDATED_MESSAGE = '앱이 새 버전으로 바뀌었어요. 브라우저에서 새로고침(F5)해 주세요.'
const CHUNK_LOAD_MESSAGE = '새 버전이 배포돼 필요한 파일이 바뀌었어요. 화면을 새로고침(F5)해 주세요.'

/** postgrest-js가 fetch 실패를 돌려주는 실제 모양(Error 인스턴스가 아니다) */
function postgrestFetchFailure(message: string) {
  return { message, details: '', hint: '', code: '' }
}

/** supabase db.timeout에 걸려 요청이 끊겼을 때 postgrest-js가 돌려주는 모양 */
const postgrestTimeout = {
  message: 'AbortError: signal is aborted without reason',
  details: 'AbortError: signal is aborted without reason',
  hint: 'Request was aborted (timeout or manual cancellation)',
  code: '',
}

/** can_use_app() 실패 시 bootstrap RPC가 돌려주는 모양 */
const appAccessRequired = {
  code: 'P0001',
  details: 'SQA_APP_ACCESS_REQUIRED',
  hint: null,
  message: 'app access required',
}

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

  it.each([
    'TypeError: Failed to fetch',
    'TypeError: NetworkError when attempting to fetch resource.',
    'TypeError: Load failed',
  ])('maps the plain postgrest fetch failure %s to the network message', (message) => {
    expect(toUserMessage(postgrestFetchFailure(message))).toBe(NETWORK_MESSAGE)
  })

  it('maps a PostgREST request timeout (AbortError) to the network message instead of the generic one', () => {
    expect(toUserMessage(postgrestTimeout)).toBe(NETWORK_MESSAGE)
    expect(toUserMessage(new DOMException('signal is aborted without reason', 'AbortError'))).toBe(NETWORK_MESSAGE)
  })

  it.each([
    ['57014', '처리 시간이 길어져 요청이 취소됐어요. 잠시 후 다시 시도해 주세요.'],
    ['55P03', '다른 사람이 같은 항목을 처리하고 있어 요청이 취소됐어요. 잠시 후 다시 시도해 주세요.'],
    ['40P01', '다른 사람이 같은 항목을 처리하고 있어 요청이 취소됐어요. 잠시 후 다시 시도해 주세요.'],
  ])('maps transient server cancellation code %s to a retry message', (code, expected) => {
    expect(toUserMessage({ code, details: null, hint: null, message: 'canceling statement' })).toBe(expected)
  })

  it('asks for a browser reload when the RPC no longer exists (PGRST202)', () => {
    expect(toUserMessage({
      code: 'PGRST202',
      details: 'Searched for the function public.get_core_bootstrap_v2 with parameters',
      hint: null,
      message: 'Could not find the function public.get_core_bootstrap_v2 in the schema cache',
    })).toBe(APP_UPDATED_MESSAGE)
  })

  it('asks for a browser reload on a bootstrap schema mismatch', () => {
    expect(toUserMessage(Object.assign(new Error('bootstrap schema mismatch'), {
      detail: 'SQA_BOOTSTRAP_SCHEMA_MISMATCH',
    }))).toBe(APP_UPDATED_MESSAGE)
  })

  it.each([
    new TypeError('Failed to fetch dynamically imported module: https://app.example/assets/productImportFile-abc.js'),
    new TypeError('error loading dynamically imported module: https://app.example/assets/ReviewPanels-abc.js'),
    new Error('Unable to preload CSS for /assets/ReviewPanels-x.css'),
  ])('tells the user to reload after a deploy instead of blaming the network: %s', (error) => {
    expect(toUserMessage(error)).toBe(CHUNK_LOAD_MESSAGE)
  })

  it('keeps the generic message for a plain server error without a known code', () => {
    expect(toUserMessage(appAccessRequired)).toBe(GENERIC_MESSAGE)
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
    expect(toErrorCode({ code: '', details: 'user@example.com review body', message: 'private failure' })).toBe('unknown')
  })

  it('reads the PostgREST details field for the app access code', () => {
    expect(toErrorCode(appAccessRequired)).toBe('SQA_APP_ACCESS_REQUIRED')
  })

  it.each([
    'TypeError: Failed to fetch',
    'TypeError: NetworkError when attempting to fetch resource.',
    'TypeError: Load failed',
  ])('classifies the plain postgrest fetch failure %s as network', (message) => {
    expect(toErrorCode(postgrestFetchFailure(message))).toBe('network')
  })

  it('classifies request timeouts as aborted, not network', () => {
    expect(toErrorCode(postgrestTimeout)).toBe('aborted')
    expect(toErrorCode(new DOMException('The operation was aborted.', 'AbortError'))).toBe('aborted')
  })

  it('classifies chunk-load failures separately from network failures', () => {
    expect(toErrorCode(new TypeError('Failed to fetch dynamically imported module: /assets/a.js'))).toBe('chunk-load')
    expect(toErrorCode(new Error('Unable to preload CSS for /assets/ReviewPanels-x.css'))).toBe('chunk-load')
  })

  it('keeps PostgREST codes such as PGRST202 and 57014', () => {
    expect(toErrorCode({ code: 'PGRST202', details: null, hint: null, message: 'Could not find the function' })).toBe('PGRST202')
    expect(toErrorCode({ code: '57014', details: null, hint: null, message: 'canceling statement due to statement timeout' })).toBe('57014')
  })
})

describe('isNetworkError', () => {
  it('keeps recognizing browser Error instances', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('recognizes plain postgrest fetch failures but not aborts or server errors', () => {
    expect(isNetworkError(postgrestFetchFailure('TypeError: Failed to fetch'))).toBe(true)
    expect(isNetworkError(postgrestFetchFailure('TypeError: Load failed'))).toBe(true)
    expect(isNetworkError(postgrestTimeout)).toBe(false)
    expect(isNetworkError(postgrestFetchFailure('AbortError: Failed to fetch'))).toBe(false)
    expect(isNetworkError({ code: '42501', message: 'TypeError: Failed to fetch' })).toBe(false)
    expect(isNetworkError(appAccessRequired)).toBe(false)
    expect(isNetworkError(null)).toBe(false)
  })
})

describe('isAbortError', () => {
  it('recognizes DOMException aborts and postgrest-wrapped aborts only', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true)
    expect(isAbortError(postgrestTimeout)).toBe(true)
    expect(isAbortError(postgrestFetchFailure('TypeError: Failed to fetch'))).toBe(false)
    expect(isAbortError(new Error('AbortError: looks similar'))).toBe(false)
  })
})

describe('isChunkLoadError', () => {
  it('recognizes stale-deploy asset failures across browsers', () => {
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/AnnouncementsPanel-x.css'))).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: /assets/a.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isChunkLoadError({ message: 'Unable to preload CSS for /assets/x.css' })).toBe(false)
  })
})

describe('errorDetailText', () => {
  it('prefers PostgREST details and falls back to app-made detail', () => {
    expect(errorDetailText(appAccessRequired)).toBe('SQA_APP_ACCESS_REQUIRED')
    expect(errorDetailText({ detail: 'SQA_BOOTSTRAP_SCHEMA_MISMATCH' })).toBe('SQA_BOOTSTRAP_SCHEMA_MISMATCH')
    expect(errorDetailText({ details: '', detail: 'SQA_BOOTSTRAP_SCHEMA_MISMATCH' })).toBe('SQA_BOOTSTRAP_SCHEMA_MISMATCH')
    expect(errorDetailText(null)).toBe('')
  })
})
