import { createClient } from '@supabase/supabase-js'

// 바꿀 때 함께 수정: src/domain/accountPolicy.ts, complete-password-change 함수, docs/OPERATIONS.md, 원격 E2E(tests/e2e/remote/remote-workflows.spec.ts)
const TEMPORARY_PASSWORD = '12345678'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type AccountRole = 'leader' | 'team_leader' | 'member'
type RequestBody =
  | { action: 'create'; email: string; name: string; role: AccountRole }
  | { action: 'reset_password'; userId: string; reason: string }

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing server configuration: ${name}`)
  return value
}

// 로그에는 분류 정보만 남긴다. PostgREST message·details에는 이메일이 들어갈 수 있어 기록하지 않는다.
function errorFields(err: unknown) {
  const value = (typeof err === 'object' && err !== null ? err : {}) as Record<string, unknown>
  const message = typeof value.message === 'string' && value.message.startsWith('Missing server configuration: ')
    ? value.message
    : undefined
  return {
    name: typeof value.name === 'string' ? value.name : undefined,
    code: typeof value.code === 'string' || typeof value.code === 'number' ? value.code : undefined,
    status: typeof value.status === 'number' ? value.status : undefined,
    ...(message ? { message } : {}),
  }
}

function logRollbackFailure(step: string, error: { code?: unknown } | null) {
  if (!error) return
  console.error('account-admin rollback failed', { step, code: errorFields(error).code })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const authorization = request.headers.get('Authorization')
  if (!authorization) return json(401, { error: 'authentication_required' })

  let action: RequestBody['action'] | undefined
  try {
    const url = requiredEnv('SUPABASE_URL')
    const anonKey = requiredEnv('SUPABASE_ANON_KEY')
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json(401, { error: 'authentication_required' })
    const { data: canManage, error: permissionError } = await userClient.rpc('can_manage_team_data')
    if (permissionError || canManage !== true) return json(403, { error: 'active_leader_required' })

    const body = await request.json() as RequestBody
    if (body?.action === 'create' || body?.action === 'reset_password') action = body.action
    if (body.action === 'create') {
      const email = body.email?.trim().toLowerCase()
      const name = body.name?.trim()
      const role = body.role
      if (!email || !/^\S+@\S+\.\S+$/.test(email) || !name || name.length > 100) {
        return json(400, { error: 'invalid_account_input' })
      }
      if (!['leader', 'team_leader', 'member'].includes(role)) return json(400, { error: 'invalid_role' })

      const { data: existingProfile } = await adminClient.from('profiles').select('id').eq('email', email).maybeSingle()
      if (existingProfile) return json(409, { error: 'account_already_exists' })

      const { data: existingAllowed, error: allowedLookupError } = await adminClient
        .from('allowed_users').select('id,name,role,created_by').eq('email', email).maybeSingle()
      if (allowedLookupError) throw allowedLookupError
      let insertedAllowedId: string | null = null
      if (existingAllowed) {
        const { error } = await adminClient.from('allowed_users').update({ name, role, created_by: userData.user.id }).eq('id', existingAllowed.id)
        if (error) throw error
      } else {
        const { data: inserted, error } = await adminClient
          .from('allowed_users').insert({ email, name, role, created_by: userData.user.id }).select('id').single()
        if (error) throw error
        insertedAllowedId = inserted.id
      }

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: TEMPORARY_PASSWORD,
        email_confirm: true,
      })
      if (createError || !created.user) {
        if (insertedAllowedId) {
          const { error } = await adminClient.from('allowed_users').delete().eq('id', insertedAllowedId)
          logRollbackFailure('delete_allowed_user', error)
        } else if (existingAllowed) {
          const { error } = await adminClient.from('allowed_users').update({
            name: existingAllowed.name,
            role: existingAllowed.role,
            created_by: existingAllowed.created_by,
          }).eq('id', existingAllowed.id)
          logRollbackFailure('restore_allowed_user', error)
        }
        return json(400, { error: 'account_creation_failed', message: createError?.message })
      }
      return json(201, { ok: true, userId: created.user.id, requiresPasswordChange: true })
    }

    if (body.action === 'reset_password') {
      const correlationId = crypto.randomUUID()
      const reason = body.reason?.trim()
      if (!body.userId || !reason || reason.length > 500) return json(400, { error: 'invalid_reset_input' })
      const { error: prepareError } = await userClient.rpc('prepare_password_reset', {
        p_target_user_id: body.userId,
        p_reason: reason,
        p_correlation_id: correlationId,
      })
      if (prepareError) return json(400, { error: 'password_reset_not_prepared', message: prepareError.message })

      const { error: resetError } = await adminClient.auth.admin.updateUserById(body.userId, { password: TEMPORARY_PASSWORD })
      if (resetError) {
        const { error: cancelError } = await userClient.rpc('cancel_password_reset', {
          p_target_user_id: body.userId,
          p_correlation_id: correlationId,
        })
        logRollbackFailure('cancel_password_reset', cancelError)
        return json(400, { error: 'password_reset_failed', message: resetError.message })
      }
      return json(200, { ok: true, requiresPasswordChange: true })
    }

    return json(400, { error: 'unsupported_action' })
  } catch (err) {
    console.error('account-admin request failed', { action, ...errorFields(err) })
    return json(500, { error: 'internal_error' })
  }
})
