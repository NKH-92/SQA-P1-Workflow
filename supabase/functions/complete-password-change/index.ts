import { createClient } from '@supabase/supabase-js'

const TEMPORARY_PASSWORD = '12345678'
const MIN_PASSWORD_LENGTH = 8
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const authorization = request.headers.get('Authorization')
  if (!authorization) return json(401, { error: 'authentication_required' })

  let password: string
  try {
    const body = await request.json() as { password?: string }
    password = body.password ?? ''
  } catch {
    return json(400, { error: 'invalid_json' })
  }
  if (password.length < MIN_PASSWORD_LENGTH) return json(400, { error: 'password_too_short' })
  if (password === TEMPORARY_PASSWORD) return json(400, { error: 'temporary_password_reuse' })

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

    const correlationId = crypto.randomUUID()
    const { error: prepareError } = await userClient.rpc('prepare_own_password_change', { p_correlation_id: correlationId })
    if (prepareError) return json(400, { error: 'password_change_not_prepared', message: prepareError.message })

    const { error: updateError } = await adminClient.auth.admin.updateUserById(userData.user.id, { password })
    if (updateError) {
      await userClient.rpc('cancel_own_password_change', { p_correlation_id: correlationId })
      return json(400, { error: 'password_change_failed', message: updateError.message })
    }
    return json(200, { ok: true, requiresRelogin: true })
  } catch {
    console.error('complete-password-change request failed')
    return json(500, { error: 'internal_error' })
  }
})
