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

  it('blocks a user who has not completed the password change from reading app data', async () => {
    const email = process.env.RLS_PENDING_PASSWORD_EMAIL
    const password = process.env.RLS_PENDING_PASSWORD
    if (!email || !password) expect.fail('Set pending-password RLS fixture credentials')

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    const { error: signInError } = await client.auth.signInWithPassword({ email, password })
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
      p_member_ids: [],
    })

    expect(error).not.toBeNull()
  })

  it('blocks member from calling the add-only product assignment RPC', async () => {
    const memberAEmail = process.env.RLS_MEMBER_A_EMAIL
    const memberAPassword = process.env.RLS_MEMBER_A_PASSWORD
    const memberBUserId = process.env.RLS_MEMBER_B_USER_ID
    const productId = process.env.RLS_TEST_PRODUCT_ID

    if (!memberAEmail || !memberAPassword || !memberBUserId || !productId) {
      expect.fail('Set RLS_MEMBER_A_EMAIL, RLS_MEMBER_A_PASSWORD, RLS_MEMBER_B_USER_ID, RLS_TEST_PRODUCT_ID')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: memberAEmail, password: memberAPassword })

    const { error } = await client.rpc('add_product_assignment', {
      p_product_id: productId,
      p_user_id: memberBUserId,
    })

    expect(error).not.toBeNull()
  })

  it('blocks a leader from assigning a product to another leader profile', async () => {
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD
    const leaderUserId = process.env.RLS_LEADER_USER_ID
    const productId = process.env.RLS_TEST_PRODUCT_ID

    if (!leaderEmail || !leaderPassword || !leaderUserId || !productId) {
      expect.fail('Set RLS_LEADER_EMAIL, RLS_LEADER_PASSWORD, RLS_LEADER_USER_ID, RLS_TEST_PRODUCT_ID')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })

    const { error } = await client.rpc('add_product_assignment', {
      p_product_id: productId,
      p_user_id: leaderUserId,
    })

    expect(error).not.toBeNull()
  })

  it('allows a leader to add an active member product assignment idempotently', async () => {
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD
    const memberBUserId = process.env.RLS_MEMBER_B_USER_ID
    const productId = process.env.RLS_TEST_PRODUCT_ID
    if (!leaderEmail || !leaderPassword || !memberBUserId || !productId) {
      expect.fail('Set leader, member B, and product RLS fixture variables')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })
    const first = await client.rpc('add_product_assignment', {
      p_product_id: productId,
      p_user_id: memberBUserId,
    })
    const second = await client.rpc('add_product_assignment', {
      p_product_id: productId,
      p_user_id: memberBUserId,
    })

    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    const { count, error } = await client
      .from('product_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId)
      .eq('user_id', memberBUserId)
    expect(error).toBeNull()
    expect(count).toBe(1)
  })

  it('allows a leader to add an active member duty assignment', async () => {
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD
    const memberBUserId = process.env.RLS_MEMBER_B_USER_ID
    const dutyId = process.env.RLS_TEST_DUTY_ID
    if (!leaderEmail || !leaderPassword || !memberBUserId || !dutyId) {
      expect.fail('Set leader, member B, and duty RLS fixture variables')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })
    const { error } = await client.rpc('add_duty_assignment', {
      p_duty_id: dutyId,
      p_user_id: memberBUserId,
    })
    expect(error).toBeNull()
  })

  it('rejects a stale project assignment replacement after the first save advances the revision', async () => {
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD
    const projectId = process.env.RLS_TEST_PROJECT_ID
    const memberBUserId = process.env.RLS_MEMBER_B_USER_ID
    if (!leaderEmail || !leaderPassword || !projectId || !memberBUserId) {
      expect.fail('Set leader, project, and member B RLS fixture variables')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })
    const { data: project, error: projectError } = await client
      .from('projects')
      .select('updated_at')
      .eq('id', projectId)
      .single()
    expect(projectError).toBeNull()
    expect(project?.updated_at).toBeTruthy()

    const first = await client.rpc('replace_project_assignments_if_current', {
      p_project_id: projectId,
      p_member_ids: [memberBUserId],
      p_expected_updated_at: project!.updated_at,
    })
    expect(first.error).toBeNull()
    expect(typeof first.data).toBe('string')

    const stale = await client.rpc('replace_project_assignments_if_current', {
      p_project_id: projectId,
      p_member_ids: [],
      p_expected_updated_at: project!.updated_at,
    })
    expect(stale.error).not.toBeNull()
  })

  it('blocks a leader from assigning a product to an inactive member', async () => {
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD
    const inactiveUserId = process.env.RLS_INACTIVE_MEMBER_USER_ID
    const productId = process.env.RLS_TEST_PRODUCT_ID
    if (!leaderEmail || !leaderPassword || !inactiveUserId || !productId) {
      expect.fail('Set leader, inactive member, and product RLS fixture variables')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })
    const { error } = await client.rpc('add_product_assignment', {
      p_product_id: productId,
      p_user_id: inactiveUserId,
    })
    expect(error).not.toBeNull()
  })

  it('does not expose add-only assignment RPCs to anonymous callers', async () => {
    const memberBUserId = process.env.RLS_MEMBER_B_USER_ID
    const productId = process.env.RLS_TEST_PRODUCT_ID
    if (!memberBUserId || !productId) expect.fail('Set member B and product RLS fixture variables')

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    const { error } = await client.rpc('add_product_assignment', {
      p_product_id: productId,
      p_user_id: memberBUserId,
    })
    expect(error).not.toBeNull()
  })
})
