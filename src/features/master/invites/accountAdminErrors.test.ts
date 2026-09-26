import { describe, expect, it } from 'vitest'
import { UserFacingError } from '../../../lib/errors'
import { accountAdminErrorMessage, assertAccountAdminResult } from './accountAdminErrors'

function httpError(body: unknown) {
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify(body), { status: 409, headers: { 'Content-Type': 'application/json' } }),
  }
}

describe('account-admin error mapping (FBK-2)', () => {
  it('turns the server error code into a reason the leader can act on', async () => {
    await expect(assertAccountAdminResult({ data: null, error: httpError({ error: 'account_already_exists' }) }, 'create'))
      .rejects.toThrow('이미 가입한 이메일이에요. 목록에서 그 계정을 찾아 확인해 주세요.')
    await expect(assertAccountAdminResult({ data: null, error: httpError({ error: 'password_reset_not_prepared', message: 'internal detail' }) }, 'reset_password'))
      .rejects.toThrow('비밀번호를 초기화할 수 없는 계정이에요. 활성 상태인 계정인지 확인해 주세요.')
  })

  it('never shows raw server text and falls back to an action-specific sentence', async () => {
    const error = await assertAccountAdminResult({ data: null, error: httpError({ message: 'db exploded' }) }, 'create')
      .catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(UserFacingError)
    expect((error as Error).message).toBe(accountAdminErrorMessage(null, 'create'))
    expect((error as Error).message).not.toContain('db exploded')
  })

  it('explains network failures and rejects a body that is not ok', async () => {
    await expect(assertAccountAdminResult({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send' } }, 'create'))
      .rejects.toThrow('계정 서버에 연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.')
    await expect(assertAccountAdminResult({ data: { ok: false, error: 'invalid_role' }, error: null }, 'create'))
      .rejects.toThrow('역할을 다시 골라 주세요.')
    await expect(assertAccountAdminResult({ data: { ok: true }, error: null }, 'create')).resolves.toBeUndefined()
  })
})
