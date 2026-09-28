// @vitest-environment node
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Edge Function(Deno) 소스를 Deno.serve 스텁으로 불러와 실패 로그에 분류 정보만 남는지 확인한다.
type Handler = (request: Request) => Promise<Response>
type Result = { data?: unknown; error?: unknown }
type Fake = {
  getUser: () => Promise<Result>
  rpc: Record<string, () => Promise<Result>>
  tables: Record<string, Record<string, () => Result>>
  createUser: () => Promise<Result>
  updateUserById: () => Promise<Result>
}

const fake: Fake = {
  getUser: async () => ({ data: { user: { id: 'leader-1' } }, error: null }),
  rpc: {},
  tables: {},
  createUser: async () => ({ data: { user: { id: 'new-1' } }, error: null }),
  updateUserById: async () => ({ data: {}, error: null }),
}

function query(table: string) {
  let operation = 'select'
  const settle = () => (fake.tables[table]?.[operation] ?? (() => ({ data: null, error: null })))()
  const chain = {
    select: () => chain,
    eq: () => chain,
    insert: () => { operation = 'insert'; return chain },
    update: () => { operation = 'update'; return chain },
    delete: () => { operation = 'delete'; return chain },
    maybeSingle: async () => settle(),
    single: async () => settle(),
    then: (resolveResult: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolveResult, reject),
  }
  return chain
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: () => fake.getUser(),
      admin: { createUser: () => fake.createUser(), updateUserById: () => fake.updateUserById() },
    },
    rpc: (name: string) => (fake.rpc[name] ?? (async () => ({ data: null, error: null })))(),
    from: (table: string) => query(table),
  }),
}))

const env: Record<string, string | undefined> = {}
let handler: Handler | undefined

async function loadFunction(name: string): Promise<Handler> {
  handler = undefined
  vi.resetModules()
  vi.stubGlobal('Deno', {
    env: { get: (key: string) => env[key] },
    serve: (next: Handler) => { handler = next },
  })
  // 경로를 변수로 넘겨 tsc가 Deno 전용 소스를 타입 검사 대상으로 끌어오지 않게 한다.
  const entry = pathToFileURL(resolve(import.meta.dirname, '..', 'supabase/functions', name, 'index.ts')).href
  await import(/* @vite-ignore */ entry)
  if (!handler) throw new Error(`Deno.serve was not called by ${name}`)
  return handler
}

function post(body: unknown) {
  return new Request('https://edge.test/fn', {
    method: 'POST',
    headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const email = 'person@example.com'
let consoleError: ReturnType<typeof vi.spyOn>

function loggedText() {
  return JSON.stringify(consoleError.mock.calls)
}

beforeEach(() => {
  Object.assign(env, {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
  })
  fake.getUser = async () => ({ data: { user: { id: 'leader-1' } }, error: null })
  fake.rpc = { can_manage_team_data: async () => ({ data: true, error: null }) }
  fake.tables = {}
  fake.createUser = async () => ({ data: { user: { id: 'new-1' } }, error: null })
  fake.updateUserById = async () => ({ data: {}, error: null })
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  consoleError.mockRestore()
  vi.unstubAllGlobals()
})

describe('account-admin failure logging', () => {
  it('logs only classification fields when a query error reaches the catch block', async () => {
    const serve = await loadFunction('account-admin')
    fake.tables.allowed_users = {
      select: () => ({
        data: null,
        error: { message: `duplicate key (email)=(${email})`, details: email, hint: null, code: '23505' },
      }),
    }

    const response = await serve(post({ action: 'create', email, name: '홍길동', role: 'member' }))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'internal_error' })
    expect(consoleError).toHaveBeenCalledWith('account-admin request failed', {
      action: 'create',
      name: undefined,
      code: '23505',
      status: undefined,
    })
    expect(loggedText()).not.toContain(email)
  })

  it('keeps the missing configuration name in the log', async () => {
    const serve = await loadFunction('account-admin')
    env.SUPABASE_SERVICE_ROLE_KEY = undefined

    const response = await serve(post({ action: 'create', email, name: '홍길동', role: 'member' }))

    expect(response.status).toBe(500)
    expect(consoleError).toHaveBeenCalledWith('account-admin request failed', {
      action: undefined,
      name: 'Error',
      code: undefined,
      status: undefined,
      message: 'Missing server configuration: SUPABASE_SERVICE_ROLE_KEY',
    })
  })

  it('logs a failed allowed_users rollback without changing the response', async () => {
    const serve = await loadFunction('account-admin')
    fake.tables.allowed_users = {
      select: () => ({ data: null, error: null }),
      insert: () => ({ data: { id: 'allowed-1' }, error: null }),
      delete: () => ({ data: null, error: { message: `row ${email}`, code: '42501' } }),
    }
    fake.createUser = async () => ({ data: { user: null }, error: { message: 'User already registered', status: 422 } })

    const response = await serve(post({ action: 'create', email, name: '홍길동', role: 'member' }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'account_creation_failed', message: 'User already registered' })
    expect(consoleError).toHaveBeenCalledWith('account-admin rollback failed', {
      step: 'delete_allowed_user',
      code: '42501',
    })
    expect(loggedText()).not.toContain(email)
  })

  it('logs a failed restore of an existing allowed_users row', async () => {
    const serve = await loadFunction('account-admin')
    fake.tables.allowed_users = {
      select: () => ({ data: { id: 'allowed-1', name: '기존', role: 'member', created_by: 'old-leader' }, error: null }),
    }
    // 첫 update(파트장 입력 반영)는 성공하고, 복원 update는 트리거에 막힌다.
    let updates = 0
    fake.tables.allowed_users.update = () => {
      updates += 1
      return updates === 1 ? { data: null, error: null } : { data: null, error: { message: 'creator', code: 'P0001' } }
    }
    fake.createUser = async () => ({ data: { user: null }, error: { message: 'failed', status: 500 } })

    const response = await serve(post({ action: 'create', email, name: '홍길동', role: 'member' }))

    expect(response.status).toBe(400)
    expect(consoleError).toHaveBeenCalledWith('account-admin rollback failed', {
      step: 'restore_allowed_user',
      code: 'P0001',
    })
  })

  it('logs a failed cancel_password_reset without changing the response', async () => {
    const serve = await loadFunction('account-admin')
    fake.rpc.prepare_password_reset = async () => ({ data: null, error: null })
    fake.rpc.cancel_password_reset = async () => ({ data: null, error: { message: 'boom', code: 'PGRST301' } })
    fake.updateUserById = async () => ({ data: null, error: { message: 'Auth error', status: 500 } })

    const response = await serve(post({ action: 'reset_password', userId: 'user-2', reason: '분실' }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'password_reset_failed', message: 'Auth error' })
    expect(consoleError).toHaveBeenCalledWith('account-admin rollback failed', {
      step: 'cancel_password_reset',
      code: 'PGRST301',
    })
  })

  it('does not log a rollback when it succeeds', async () => {
    const serve = await loadFunction('account-admin')
    fake.rpc.prepare_password_reset = async () => ({ data: null, error: null })
    fake.updateUserById = async () => ({ data: null, error: { message: 'Auth error', status: 500 } })

    await serve(post({ action: 'reset_password', userId: 'user-2', reason: '분실' }))

    expect(consoleError).not.toHaveBeenCalled()
  })
})

describe('complete-password-change failure logging', () => {
  it('logs only classification fields from the catch block', async () => {
    const serve = await loadFunction('complete-password-change')
    fake.getUser = async () => {
      throw Object.assign(new TypeError(`fetch failed for ${email}`), { status: 503 })
    }

    const response = await serve(post({ password: 'new-password-1' }))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'internal_error' })
    expect(consoleError).toHaveBeenCalledWith('complete-password-change request failed', {
      name: 'TypeError',
      code: undefined,
      status: 503,
    })
    expect(loggedText()).not.toContain(email)
  })

  it('logs a failed cancel_own_password_change without changing the response', async () => {
    const serve = await loadFunction('complete-password-change')
    fake.rpc.prepare_own_password_change = async () => ({ data: null, error: null })
    fake.rpc.cancel_own_password_change = async () => ({ data: null, error: { message: email, code: '40001' } })
    fake.updateUserById = async () => ({ data: null, error: { message: 'weak password', status: 422 } })

    const response = await serve(post({ password: 'new-password-1' }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'password_change_failed', message: 'weak password' })
    expect(consoleError).toHaveBeenCalledWith('complete-password-change rollback failed', {
      step: 'cancel_own_password_change',
      code: '40001',
    })
    expect(loggedText()).not.toContain(email)
  })
})

describe('temporary password source of truth', () => {
  it('keeps both Edge Functions on the shared temporary password value', async () => {
    const { TEMPORARY_PASSWORD } = await import('./domain/accountPolicy')
    const { readFileSync } = await import('node:fs')
    for (const name of ['account-admin', 'complete-password-change']) {
      const source = readFileSync(resolve(import.meta.dirname, '..', 'supabase/functions', name, 'index.ts'), 'utf8')
      expect(source).toContain(`const TEMPORARY_PASSWORD = '${TEMPORARY_PASSWORD}'`)
      expect(source).toContain('src/domain/accountPolicy.ts')
    }
  })
})
