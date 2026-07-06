import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { isSupabaseLocalConfigured, RLS_SKIP_NOTE } from './helpers'

const describeRls = isSupabaseLocalConfigured() ? describe : describe.skip

describeRls(`RLS assignments (${RLS_SKIP_NOTE})`, () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''

  it('blocks inactive member from reading app data', async () => {
    const inactiveEmail = process.env.RLS_INACTIVE_MEMBER_EMAIL
    const inactivePassword = process.env.RLS_INACTIVE_MEMBER_PASSWORD

    if (!inactiveEmail || !inactivePassword) {
      expect.fail('Set RLS_INACTIVE_MEMBER_EMAIL and RLS_INACTIVE_MEMBER_PASSWORD')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    const { error: signInError } = await client.auth.signInWithPassword({
      email: inactiveEmail,
      password: inactivePassword,
    })
    expect(signInError).toBeNull()

    const { data, error } = await client.from('products').select('id').limit(1)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('blocks member from reading another member product assignments', async () => {
    const memberAEmail = process.env.RLS_MEMBER_A_EMAIL
    const memberAPassword = process.env.RLS_MEMBER_A_PASSWORD
    const memberBUserId = process.env.RLS_MEMBER_B_USER_ID

    if (!memberAEmail || !memberAPassword || !memberBUserId) {
      expect.fail('Set RLS_MEMBER_A_EMAIL, RLS_MEMBER_A_PASSWORD, RLS_MEMBER_B_USER_ID')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: memberAEmail, password: memberAPassword })

    const { data, error } = await client
      .from('product_assignments')
      .select('id')
      .eq('user_id', memberBUserId)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('blocks member from replacing product assignments', async () => {
    const memberAEmail = process.env.RLS_MEMBER_A_EMAIL
    const memberAPassword = process.env.RLS_MEMBER_A_PASSWORD
    const productId = process.env.RLS_TEST_PRODUCT_ID

    if (!memberAEmail || !memberAPassword || !productId) {
      expect.fail('Set RLS_MEMBER_A_EMAIL, RLS_MEMBER_A_PASSWORD, RLS_TEST_PRODUCT_ID')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: memberAEmail, password: memberAPassword })

    const { error } = await client.rpc('replace_product_assignments', {
      p_product_id: productId,
      p_user_ids: [],
    })

    expect(error).not.toBeNull()
  })
})
