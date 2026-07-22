import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured, RLS_SKIP_NOTE } from './helpers'

const describeRls = isSupabaseRlsTargetConfigured() ? describe : describe.skip

describeRls(`RLS public leader profiles (${RLS_SKIP_NOTE})`, () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''

  it('allows member to read leader names without full profile access', async () => {
    const memberEmail = process.env.RLS_MEMBER_A_EMAIL
    const memberPassword = process.env.RLS_MEMBER_A_PASSWORD

    if (!memberEmail || !memberPassword) {
      expect.fail('Set RLS_MEMBER_A_EMAIL and RLS_MEMBER_A_PASSWORD')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    const { error: signInError } = await client.auth.signInWithPassword({
      email: memberEmail,
      password: memberPassword,
    })
    expect(signInError).toBeNull()

    const { data, error } = await client.from('public_leader_profiles').select('id, name')
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((row) => 'name' in row && !('email' in row))).toBe(true)
  })

  it('returns no leader names to an inactive authenticated profile', async () => {
    const email = process.env.RLS_INACTIVE_MEMBER_EMAIL
    const password = process.env.RLS_INACTIVE_MEMBER_PASSWORD
    if (!email || !password) expect.fail('Set inactive member RLS fixture credentials')

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    const { error: signInError } = await client.auth.signInWithPassword({ email, password })
    expect(signInError).toBeNull()

    const { data, error } = await client.from('public_leader_profiles').select('id, name')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('does not expose the compatibility view to anonymous callers', async () => {
    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    const { data, error } = await client.from('public_leader_profiles').select('id, name')
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })
})
