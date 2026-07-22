import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured, RLS_SKIP_NOTE } from './helpers'

const describeRls = isSupabaseRlsTargetConfigured() ? describe : describe.skip

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

  it('blocks member from saving an unassigned product reason', async () => {
    const memberAEmail = process.env.RLS_MEMBER_A_EMAIL
    const memberAPassword = process.env.RLS_MEMBER_A_PASSWORD
    const productId = process.env.RLS_TEST_PRODUCT_ID
    if (!memberAEmail || !memberAPassword || !productId) {
      expect.fail('Set member A and product RLS fixture variables')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: memberAEmail, password: memberAPassword })
    const { error } = await client.rpc('replace_product_assignments_with_reason', {
      p_product_id: productId,
      p_member_ids: [],
      p_unassigned_reason: '허용되면 안 됨',
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
    const first = await client.rpc('try_add_product_assignment', {
      p_product_id: productId,
      p_user_id: memberBUserId,
    })
    const second = await client.rpc('try_add_product_assignment', {
      p_product_id: productId,
      p_user_id: memberBUserId,
    })

    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    expect(typeof first.data).toBe('boolean')
    expect(second.data).toBe(false)
    const { count, error } = await client
      .from('product_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId)
      .eq('user_id', memberBUserId)
    expect(error).toBeNull()
    expect(count).toBe(1)
  })

  it('atomically stores an unassigned reason and clears it on assignment', async () => {
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD
    const memberBUserId = process.env.RLS_MEMBER_B_USER_ID
    const productId = process.env.RLS_TEST_PRODUCT_ID
    if (!leaderEmail || !leaderPassword || !memberBUserId || !productId) {
      expect.fail('Set leader, member B, and product RLS fixture variables')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })

    const revision = await client.from('products').select('updated_at').eq('id', productId).single()
    expect(revision.error).toBeNull()
    const unassign = await client.rpc('replace_product_assignments_if_current', {
      p_product_id: productId,
      p_member_ids: [],
      p_unassigned_reason: ' 담당 제품군 조정 중 ',
      p_expected_updated_at: revision.data!.updated_at,
      p_reason: 'RLS unassigned reason contract',
      p_correlation_id: crypto.randomUUID(),
    })
    expect(unassign.error).toBeNull()

    const saved = await client.from('products').select('unassigned_reason').eq('id', productId).single()
    expect(saved.error).toBeNull()
    expect(saved.data?.unassigned_reason).toBe('담당 제품군 조정 중')

    const assign = await client.rpc('try_add_product_assignment', {
      p_product_id: productId,
      p_user_id: memberBUserId,
    })
    expect(assign.error).toBeNull()

    const cleared = await client.from('products').select('unassigned_reason').eq('id', productId).single()
    expect(cleared.error).toBeNull()
    expect(cleared.data?.unassigned_reason).toBeNull()
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
    const { error } = await client.rpc('try_add_duty_assignment', {
      p_duty_id: dutyId,
      p_user_id: memberBUserId,
    })
    expect(error).toBeNull()
  })

  it('allows the current active leader to assign a project to themselves', async () => {
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD
    const leaderUserId = process.env.RLS_LEADER_USER_ID
    if (!leaderEmail || !leaderPassword || !leaderUserId) {
      expect.fail('Set leader RLS fixture variables')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })
    const created = await client.rpc('create_project_with_assignments', {
      p_name: 'RLS Leader Self Assignment',
      p_description: 'current leader only',
      p_deadline: null,
      p_status: 'planned',
      p_member_ids: [leaderUserId],
    })

    expect(created.error).toBeNull()
    expect(typeof created.data).toBe('string')
    const assignment = await client
      .from('project_assignments')
      .select('user_id')
      .eq('project_id', created.data as string)
      .single()
    expect(assignment.error).toBeNull()
    expect(assignment.data?.user_id).toBe(leaderUserId)
  })

  it('blocks a leader from assigning a project to a different leader', async () => {
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD
    const otherLeaderUserId = process.env.RLS_LEADER_B_USER_ID
    if (!leaderEmail || !leaderPassword || !otherLeaderUserId) {
      expect.fail('Set both leader RLS fixture variables')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })
    const { error } = await client.rpc('create_project_with_assignments', {
      p_name: 'RLS Other Leader Assignment',
      p_description: 'must fail',
      p_deadline: null,
      p_status: 'planned',
      p_member_ids: [otherLeaderUserId],
    })

    expect(error).not.toBeNull()
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

  it('does not expose the product unassigned-reason RPC to anonymous callers', async () => {
    const productId = process.env.RLS_TEST_PRODUCT_ID
    if (!productId) expect.fail('Set product RLS fixture variables')

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    const { error } = await client.rpc('replace_product_assignments_with_reason', {
      p_product_id: productId,
      p_member_ids: [],
      p_unassigned_reason: 'anonymous',
    })
    expect(error).not.toBeNull()
  })

  // Boolean-returning try_add_* RPCs reuse the exact same permission/target
  // validation as add_product_assignment/add_duty_assignment (unchanged above), so the
  // negative-permission cases are not repeated exhaustively here — only the new
  // true/false/no-op/concurrency contract that motivated the new RPCs.

  it('does not expose try_add_product_assignment to anonymous or member callers', async () => {
    const memberAEmail = process.env.RLS_MEMBER_A_EMAIL
    const memberAPassword = process.env.RLS_MEMBER_A_PASSWORD
    const memberBUserId = process.env.RLS_MEMBER_B_USER_ID
    const productId = process.env.RLS_TEST_PRODUCT_ID
    if (!memberAEmail || !memberAPassword || !memberBUserId || !productId) {
      expect.fail('Set RLS_MEMBER_A_EMAIL, RLS_MEMBER_A_PASSWORD, RLS_MEMBER_B_USER_ID, RLS_TEST_PRODUCT_ID')
    }

    const anonymous = createClient(url, anonKey, { auth: { persistSession: false } })
    const anonymousResult = await anonymous.rpc('try_add_product_assignment', {
      p_product_id: productId,
      p_user_id: memberBUserId,
    })
    expect(anonymousResult.error).not.toBeNull()

    const member = createClient(url, anonKey, { auth: { persistSession: false } })
    await member.auth.signInWithPassword({ email: memberAEmail, password: memberAPassword })
    const memberResult = await member.rpc('try_add_product_assignment', {
      p_product_id: productId,
      p_user_id: memberBUserId,
    })
    expect(memberResult.error).not.toBeNull()
  })

  it('resolves try_add_product_assignment to true on insert and false on a duplicate no-op', async () => {
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD
    const memberAId = process.env.RLS_MEMBER_A_USER_ID
    const productId = process.env.RLS_TEST_PRODUCT_ID
    if (!leaderEmail || !leaderPassword || !memberAId || !productId) {
      expect.fail('Set RLS_LEADER_EMAIL, RLS_LEADER_PASSWORD, RLS_MEMBER_A_USER_ID, RLS_TEST_PRODUCT_ID')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })

    const inserted = await client.rpc('try_add_product_assignment', {
      p_product_id: productId,
      p_user_id: memberAId,
    })
    expect(inserted.error).toBeNull()
    expect(inserted.data).toBe(true)

    const duplicate = await client.rpc('try_add_product_assignment', {
      p_product_id: productId,
      p_user_id: memberAId,
    })
    expect(duplicate.error).toBeNull()
    expect(duplicate.data).toBe(false)

    const { count, error } = await client
      .from('product_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId)
      .eq('user_id', memberAId)
    expect(error).toBeNull()
    expect(count).toBe(1)
  })

  it('resolves concurrent duplicate try_add_duty_assignment calls to a single insert and a single private audit event', async () => {
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD
    const memberAId = process.env.RLS_MEMBER_A_USER_ID
    const dutyId = process.env.RLS_TEST_DUTY_ID
    if (!leaderEmail || !leaderPassword || !memberAId || !dutyId) {
      expect.fail('Set RLS_LEADER_EMAIL, RLS_LEADER_PASSWORD, RLS_MEMBER_A_USER_ID, RLS_TEST_DUTY_ID')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })

    const [first, second] = await Promise.all([
      client.rpc('try_add_duty_assignment', { p_duty_id: dutyId, p_user_id: memberAId }),
      client.rpc('try_add_duty_assignment', { p_duty_id: dutyId, p_user_id: memberAId }),
    ])
    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    const results = [first.data, second.data]
    // Exactly one of the two concurrent calls actually inserted the row — the unique
    // constraint on (user_id, duty_id) plus ON CONFLICT DO NOTHING makes this deterministic
    // even under a race, not just under sequential calls.
    expect(results.filter((value) => value === true)).toHaveLength(1)
    expect(results.filter((value) => value === false)).toHaveLength(1)

    const { count, error } = await client
      .from('duty_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('duty_id', dutyId)
      .eq('user_id', memberAId)
    expect(error).toBeNull()
    expect(count).toBe(1)

    // Private audit is authoritative (D-05): the no-op call must not add a second
    // 'inserted' audit_events row for this duty_assignment.
    const audit = await client.rpc('list_audit_events_v2', { p_limit: 100, p_before_id: null })
    expect(audit.error).toBeNull()
    const insertedEvents = (audit.data ?? []).filter((event: {
      entity_type: string
      action: string
      after_delta: { user_id?: string; duty_id?: string } | null
    }) =>
      event.entity_type === 'duty_assignment'
      && event.action === 'inserted'
      && event.after_delta?.user_id === memberAId
      && event.after_delta?.duty_id === dutyId,
    )
    expect(insertedEvents).toHaveLength(1)
  })
})
