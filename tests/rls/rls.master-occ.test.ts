import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured, RLS_SKIP_NOTE } from './helpers'

const describeRls = isSupabaseRlsTargetConfigured() ? describe : describe.skip

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Set ${name}`)
  return value
}

/**
 * Master OCC + authoritative-audit-reason RPCs
 * (supabase/migrations/20260720140000_master_occ_audit_reasons.sql). Covers
 * the plan's required scenarios: two-actor race, stale assignment
 * replacement preserving a concurrent add, no-op audit policy, reason
 * required, member/anon deny, last-active-leader protection unchanged, and
 * reason/source/correlation id landing in the private authoritative audit.
 */
describeRls(`RLS master OCC and audit reasons (${RLS_SKIP_NOTE})`, () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
  const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }
  const serviceClient = () => createClient(url, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), clientOptions)

  function leaderClient() {
    return createClient(url, anonKey, clientOptions)
  }

  async function signInLeader(client: ReturnType<typeof createClient>) {
    const { error } = await client.auth.signInWithPassword({
      email: requiredEnv('RLS_LEADER_EMAIL'),
      password: requiredEnv('RLS_LEADER_PASSWORD'),
    })
    expect(error).toBeNull()
  }

  async function signInMemberA(client: ReturnType<typeof createClient>) {
    const { error } = await client.auth.signInWithPassword({
      email: requiredEnv('RLS_MEMBER_A_EMAIL'),
      password: requiredEnv('RLS_MEMBER_A_PASSWORD'),
    })
    expect(error).toBeNull()
  }

  it('rejects a stale product update after another leader already advanced the revision (two-actor race)', async () => {
    const productId = requiredEnv('RLS_TEST_PRODUCT_ID')
    const client = leaderClient()
    await signInLeader(client)

    const before = await client.from('products').select('name, updated_at').eq('id', productId).single()
    expect(before.error).toBeNull()
    const staleUpdatedAt = before.data!.updated_at

    // Actor B (same leader session, simulating a second browser tab) saves an
    // actual field change first; a semantic no-op intentionally does not bump OCC.
    const actorBName = `${before.data!.name}-actor-b-${crypto.randomUUID().slice(0, 8)}`
    const first = await client.rpc('update_product_if_current', {
      p_product_id: productId,
      p_expected_updated_at: staleUpdatedAt,
      p_name: actorBName,
      p_category: '자사',
      p_company_name: '자사',
      p_unassigned_reason: null,
      p_sort_order: null,
      p_reason: 'Actor B: 정보 갱신',
    })
    expect(first.error).toBeNull()
    expect(typeof first.data).toBe('string')
    expect(first.data).not.toBe(staleUpdatedAt)

    // Actor A still holds the pre-save revision and tries to save over it.
    const stale = await client.rpc('update_product_if_current', {
      p_product_id: productId,
      p_expected_updated_at: staleUpdatedAt,
      p_name: 'Actor A stale write',
      p_category: '자사',
      p_company_name: '자사',
      p_unassigned_reason: null,
      p_sort_order: null,
      p_reason: 'Actor A: 정보 갱신',
    })
    expect(stale.error).not.toBeNull()
    expect(stale.error!.message).toContain('changed since it was opened')

    // Actor B's committed name is untouched by the rejected stale write.
    const after = await client.from('products').select('name').eq('id', productId).single()
    expect(after.error).toBeNull()
    expect(after.data?.name).toBe(actorBName)
  })

  it('preserves a concurrent add when a stale assignment replacement is rejected', async () => {
    const service = serviceClient()
    const fixture = await service
      .from('products')
      .insert({
        name: `RLS isolated OCC assignment ${crypto.randomUUID()}`,
        category: '자사',
        company_name: '자사',
      })
      .select('id')
      .single()
    expect(fixture.error).toBeNull()
    const productId = fixture.data!.id
    const memberBId = requiredEnv('RLS_MEMBER_B_USER_ID')
    const client = leaderClient()
    await signInLeader(client)

    try {
      const snapshot = await client.from('products').select('updated_at').eq('id', productId).single()
      expect(snapshot.error).toBeNull()
      const staleRevision = snapshot.data!.updated_at

      // A concurrent add lands after the snapshot was taken (e.g. another leader's action).
      const added = await client.rpc('try_add_product_assignment', { p_product_id: productId, p_user_id: memberBId })
      expect(added.error).toBeNull()
      expect(added.data).toBe(true)

      // The stale-snapshot editor tries to save an empty member list over that revision.
      const stale = await client.rpc('replace_product_assignments_if_current', {
        p_product_id: productId,
        p_member_ids: [],
        p_unassigned_reason: null,
        p_expected_updated_at: staleRevision,
        p_reason: 'stale replace attempt',
        p_correlation_id: crypto.randomUUID(),
      })
      expect(stale.error).not.toBeNull()
      expect(stale.error!.message).toContain('changed since it was opened')

      // The concurrent add survives because the stale replace never executed.
      const { count, error } = await client
        .from('product_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId)
        .eq('user_id', memberBId)
      expect(error).toBeNull()
      expect(count).toBe(1)
    } finally {
      await service.from('products').delete().eq('id', productId)
    }
  })

  it('rejects an update without a reason and reports a distinct not-found error for a missing row', async () => {
    const productId = requiredEnv('RLS_TEST_PRODUCT_ID')
    const client = leaderClient()
    await signInLeader(client)

    const current = await client.from('products').select('updated_at').eq('id', productId).single()
    expect(current.error).toBeNull()

    const noReason = await client.rpc('update_product_if_current', {
      p_product_id: productId,
      p_expected_updated_at: current.data!.updated_at,
      p_name: 'Reasonless update',
      p_category: '자사',
      p_company_name: '자사',
      p_unassigned_reason: null,
      p_sort_order: null,
      p_reason: '   ',
    })
    expect(noReason.error).not.toBeNull()
    expect(noReason.error!.message).toContain('reason is required')

    const notFound = await client.rpc('update_product_if_current', {
      p_product_id: '00000000-0000-0000-0000-000000000000',
      p_expected_updated_at: current.data!.updated_at,
      p_name: 'Missing row',
      p_category: '자사',
      p_company_name: '자사',
      p_unassigned_reason: null,
      p_sort_order: null,
      p_reason: '사유',
    })
    expect(notFound.error).not.toBeNull()
    expect(notFound.error!.message).toContain('not found')
    expect(notFound.error!.message).not.toContain('changed since it was opened')
  })

  it('records reason, source, and correlation id on a real change, and no row at all for a no-op', async () => {
    const fixture = await serviceClient().from('products').insert({
      name: `RLS audit OCC ${crypto.randomUUID()}`,
      category: '자사',
      company_name: '자사',
    }).select('id').single()
    expect(fixture.error).toBeNull()
    const productId = fixture.data!.id
    const client = leaderClient()
    await signInLeader(client)

    const before = await client.from('products').select('name, category, company_name, sort_order, updated_at').eq('id', productId).single()
    expect(before.error).toBeNull()

    const correlationId = crypto.randomUUID()
    const reason = `RLS audit reason ${correlationId}`
    const changed = await client.rpc('update_product_if_current', {
      p_product_id: productId,
      p_expected_updated_at: before.data!.updated_at,
      p_name: `${before.data!.name} (audited)`,
      p_category: before.data!.category,
      p_company_name: before.data!.company_name,
      p_unassigned_reason: null,
      p_sort_order: before.data!.sort_order,
      p_reason: reason,
      p_correlation_id: correlationId,
    })
    expect(changed.error).toBeNull()
    const revisionAfterChange = changed.data as string

    const audit = await client.rpc('list_audit_events_v2', { p_limit: 50, p_before_id: null })
    expect(audit.error).toBeNull()
    const events = (audit.data ?? []) as Array<{
      entity_type: string
      entity_id: string | null
      reason: string | null
      source: string
      after_delta: { name?: string }
    }>
    const matching = events.filter((event) => event.entity_type === 'product' && event.entity_id === productId)
    expect(matching[0]).toMatchObject({
      reason,
      source: 'update_product_if_current',
    })
    expect(matching[0].after_delta.name).toBe(`${before.data!.name} (audited)`)
    const auditCountAfterChange = matching.length

    // A no-op call (identical payload, current revision) must not add a second audit row.
    const noop = await client.rpc('update_product_if_current', {
      p_product_id: productId,
      p_expected_updated_at: revisionAfterChange,
      p_name: `${before.data!.name} (audited)`,
      p_category: before.data!.category,
      p_company_name: before.data!.company_name,
      p_unassigned_reason: null,
      p_sort_order: before.data!.sort_order,
      p_reason: 'no-op probe',
    })
    expect(noop.error).toBeNull()
    expect(noop.data).toBe(revisionAfterChange)

    const auditAfterNoop = await client.rpc('list_audit_events_v2', { p_limit: 50, p_before_id: null })
    expect(auditAfterNoop.error).toBeNull()
    const matchingAfterNoop = (auditAfterNoop.data ?? []).filter(
      (event: { entity_type: string; entity_id: string | null }) =>
        event.entity_type === 'product' && event.entity_id === productId,
    )
    expect(matchingAfterNoop).toHaveLength(auditCountAfterChange)

    // Restore the product name so this fixture stays reusable for other tests.
    await client.rpc('update_product_if_current', {
      p_product_id: productId,
      p_expected_updated_at: revisionAfterChange,
      p_name: before.data!.name,
      p_category: before.data!.category,
      p_company_name: before.data!.company_name,
      p_unassigned_reason: null,
      p_sort_order: before.data!.sort_order,
      p_reason: 'RLS fixture restore',
    })
    const cleanup = await serviceClient().from('products').delete().eq('id', productId)
    expect(cleanup.error).toBeNull()
  })

  it('still blocks self-deactivation through the new OCC RPC (last-active-leader guard unchanged)', async () => {
    const leaderId = requiredEnv('RLS_LEADER_USER_ID')
    const client = leaderClient()
    await signInLeader(client)

    const before = await client.from('profiles').select('updated_at').eq('id', leaderId).single()
    expect(before.error).toBeNull()

    const { error } = await client.rpc('set_profile_active_if_current', {
      p_profile_id: leaderId,
      p_expected_updated_at: before.data!.updated_at,
      p_is_active: false,
      p_reason: '본인 비활성화 시도',
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('cannot deactivate your own account')
  })

  it('denies member and anonymous callers on every master OCC RPC', async () => {
    const productId = requiredEnv('RLS_TEST_PRODUCT_ID')
    const dutyId = requiredEnv('RLS_TEST_DUTY_ID')
    const leaderId = requiredEnv('RLS_LEADER_USER_ID')

    const member = leaderClient()
    await signInMemberA(member)
    const anonymous = createClient(url, anonKey, clientOptions)

    for (const client of [member, anonymous]) {
      const productResult = await client.rpc('update_product_if_current', {
        p_product_id: productId,
        p_expected_updated_at: new Date().toISOString(),
        p_name: 'Denied',
        p_category: '자사',
        p_company_name: '자사',
        p_unassigned_reason: null,
        p_sort_order: null,
        p_reason: '사유',
      })
      expect(productResult.error).not.toBeNull()

      const dutyResult = await client.rpc('update_duty_if_current', {
        p_duty_id: dutyId,
        p_expected_updated_at: new Date().toISOString(),
        p_name: 'Denied',
        p_major_category_id: dutyId,
        p_sort_order: null,
        p_assignee_label: null,
        p_notes: null,
        p_reason: '사유',
      })
      expect(dutyResult.error).not.toBeNull()

      const categoryResult = await client.rpc('update_duty_major_category_if_current', {
        p_major_category_id: '00000000-0000-0000-0000-000000000000',
        p_expected_updated_at: new Date().toISOString(),
        p_name: 'Denied',
        p_sort_order: null,
        p_reason: 'denied',
        p_correlation_id: crypto.randomUUID(),
      })
      expect(categoryResult.error).not.toBeNull()

      const inviteResult = await client.rpc('update_allowed_user_if_current', {
        p_allowed_user_id: '00000000-0000-0000-0000-000000000000',
        p_expected_updated_at: new Date().toISOString(),
        p_email: 'denied@example.test',
        p_name: 'Denied',
        p_role: 'member',
        p_reason: 'denied',
        p_correlation_id: crypto.randomUUID(),
      })
      expect(inviteResult.error).not.toBeNull()

      const profileResult = await client.rpc('set_profile_active_if_current', {
        p_profile_id: leaderId,
        p_expected_updated_at: new Date().toISOString(),
        p_is_active: false,
        p_reason: '사유',
      })
      expect(profileResult.error).not.toBeNull()

      const assignmentResult = await client.rpc('replace_product_assignments_if_current', {
        p_product_id: productId,
        p_member_ids: [],
        p_unassigned_reason: null,
        p_expected_updated_at: new Date().toISOString(),
        p_reason: 'member denied',
        p_correlation_id: crypto.randomUUID(),
      })
      expect(assignmentResult.error).not.toBeNull()

      const dutyAssignmentResult = await client.rpc('replace_duty_assignments_if_current', {
        p_duty_id: dutyId,
        p_member_ids: [],
        p_expected_updated_at: new Date().toISOString(),
        p_reason: 'member denied',
        p_correlation_id: crypto.randomUUID(),
      })
      expect(dutyAssignmentResult.error).not.toBeNull()

      const roleResult = await client.rpc('set_profile_role_if_current', {
        p_profile_id: leaderId,
        p_expected_updated_at: new Date().toISOString(),
        p_role: 'member',
        p_reason: '사유',
        p_correlation_id: crypto.randomUUID(),
      })
      expect(roleResult.error).not.toBeNull()
    }
  })

  it('denies the invite OCC RPC to inactive and password-change-pending leader sessions', async () => {
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const leaderBId = requiredEnv('RLS_LEADER_B_USER_ID')
    const leaderB = leaderClient()
    const admin = createClient(url, serviceRoleKey, clientOptions)
    const signedIn = await leaderB.auth.signInWithPassword({
      email: requiredEnv('RLS_LEADER_B_EMAIL'),
      password: requiredEnv('RLS_LEADER_B_PASSWORD'),
    })
    expect(signedIn.error).toBeNull()

    const invite = await leaderB.from('allowed_users').select('id,email,name,role,updated_at').limit(1).single()
    expect(invite.error).toBeNull()
    const callInviteUpdate = () => leaderB.rpc('update_allowed_user_if_current', {
      p_allowed_user_id: invite.data!.id,
      p_expected_updated_at: invite.data!.updated_at,
      p_email: invite.data!.email,
      p_name: invite.data!.name,
      p_role: invite.data!.role,
      p_reason: 'authorization probe',
      p_correlation_id: crypto.randomUUID(),
    })

    try {
      const deactivated = await admin.from('profiles').update({ is_active: false }).eq('id', leaderBId)
      expect(deactivated.error).toBeNull()
      expect((await callInviteUpdate()).error).not.toBeNull()

      const passwordPending = await admin
        .from('profiles')
        .update({ is_active: true, must_change_password: true })
        .eq('id', leaderBId)
      expect(passwordPending.error).toBeNull()
      expect((await callInviteUpdate()).error).not.toBeNull()
    } finally {
      const restored = await admin
        .from('profiles')
        .update({ is_active: true, must_change_password: false })
        .eq('id', leaderBId)
      expect(restored.error).toBeNull()
    }
  })
})
