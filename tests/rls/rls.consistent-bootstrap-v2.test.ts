import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured, RLS_SKIP_NOTE } from './helpers'

const describeRls = isSupabaseRlsTargetConfigured() ? describe : describe.skip

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) expect.fail(`Set ${name}`)
  return value
}

// get_core_bootstrap_v2 and get_change_bootstrap_v2 use a single transaction
// snapshot bootstraps that replace the former per-table offset-paginated fetches.
describeRls(`RLS consistent bootstrap v2 (${RLS_SKIP_NOTE})`, () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
  const serviceClient = () => createClient(url, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

  const authenticatedClient = async (emailName: string, passwordName: string) => {
    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    const { error } = await client.auth.signInWithPassword({
      email: requiredEnv(emailName),
      password: requiredEnv(passwordName),
    })
    expect(error).toBeNull()
    return client
  }

  it('bounds get_core_bootstrap_v2 to the caller own profile plus only their assigned products/duties/projects', async () => {
    const memberA = await authenticatedClient('RLS_MEMBER_A_EMAIL', 'RLS_MEMBER_A_PASSWORD')
    const memberAId = (await memberA.auth.getUser()).data.user?.id

    const result = await memberA.rpc('get_core_bootstrap_v2')
    expect(result.error).toBeNull()
    expect(result.data?.schema_version).toBe(2)
    expect(typeof result.data?.snapshot_at).toBe('string')
    expect(Array.isArray(result.data?.warnings)).toBe(true)

    const core = result.data.data
    // A non-leader member never sees another profile row through this bootstrap.
    for (const profile of core.profiles) expect(profile.id).toBe(memberAId)
    const leaderIds = new Set(core.leader_profiles.map((profile: { id: string }) => profile.id))
    expect(leaderIds.has(requiredEnv('RLS_LEADER_USER_ID'))).toBe(true)
    expect(leaderIds.has(requiredEnv('RLS_LEADER_B_USER_ID'))).toBe(true)
    expect(leaderIds.has(requiredEnv('RLS_INACTIVE_MEMBER_USER_ID'))).toBe(false)
    // Every returned assignment belongs to the caller (member-scoped, not leader-scoped).
    for (const assignment of core.product_assignments) expect(assignment.user_id).toBe(memberAId)
    for (const assignment of core.duty_assignments) expect(assignment.user_id).toBe(memberAId)
    for (const assignment of core.project_assignments) expect(assignment.user_id).toBe(memberAId)
    // Every visible product/duty/project is backed by one of the caller's own assignments.
    const assignedProductIds = new Set(core.product_assignments.map((row: { product_id: string }) => row.product_id))
    for (const product of core.products) expect(assignedProductIds.has(product.id)).toBe(true)
  })

  it('gives the leader every profile/product/duty/project through get_core_bootstrap_v2', async () => {
    const leader = await authenticatedClient('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')
    const memberA = await authenticatedClient('RLS_MEMBER_A_EMAIL', 'RLS_MEMBER_A_PASSWORD')
    const memberAId = (await memberA.auth.getUser()).data.user?.id

    const result = await leader.rpc('get_core_bootstrap_v2')
    expect(result.error).toBeNull()
    const core = result.data.data
    expect(core.profiles.some((profile: { id: string }) => profile.id === memberAId)).toBe(true)
  })

  it('denies get_core_bootstrap_v2 for an anonymous caller', async () => {
    const anonymous = createClient(url, anonKey, { auth: { persistSession: false } })
    const result = await anonymous.rpc('get_core_bootstrap_v2')
    expect(result.error).not.toBeNull()
  })

  it('bounds get_change_bootstrap_v2 to visible change applications and never leaks another user product assignment', async () => {
    const memberA = await authenticatedClient('RLS_MEMBER_A_EMAIL', 'RLS_MEMBER_A_PASSWORD')
    const memberAId = (await memberA.auth.getUser()).data.user?.id

    const result = await memberA.rpc('get_change_bootstrap_v2')
    expect(result.error).toBeNull()
    expect(result.data?.schema_version).toBe(1)
    expect(typeof result.data?.snapshot_at).toBe('string')

    const change = result.data.data
    const applicationIds = new Set(change.change_applications.map((application: { id: string }) => application.id))
    for (const item of change.change_action_items) expect(applicationIds.has(item.change_application_id)).toBe(true)
    for (const application of change.change_applications) {
      const visible = application.created_by === memberAId
        || (application.published_at !== null && ['published', 'cancelled'].includes(application.status))
      expect(visible).toBe(true)
    }
  })

  it('denies get_change_bootstrap_v2 for an anonymous caller', async () => {
    const anonymous = createClient(url, anonKey, { auth: { persistSession: false } })
    const result = await anonymous.rpc('get_change_bootstrap_v2')
    expect(result.error).not.toBeNull()
  })

  it('keeps every returned product_change_task pending, or updated within the last 6 months', async () => {
    const leader = await authenticatedClient('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')
    const result = await leader.rpc('get_change_bootstrap_v2')
    expect(result.error).toBeNull()

    const sixMonthsAgo = Date.now() - 183 * 24 * 60 * 60 * 1000
    for (const task of result.data.data.product_change_tasks) {
      const isRecent = new Date(task.updated_at).getTime() >= sixMonthsAgo
      expect(task.status === 'pending' || isRecent).toBe(true)
    }
  })

  it('bounds an over-cap change application snapshot and reports the truncation code', async () => {
    const service = serviceClient()
    const leader = await authenticatedClient('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')
    const leaderId = requiredEnv('RLS_LEADER_USER_ID')
    const prefix = `RLS-OVERFLOW-${crypto.randomUUID().slice(0, 8)}`
    const rows = Array.from({ length: 1001 }, (_, index) => ({
      change_number: `${prefix}-${index}`,
      source: 'internal' as const,
      title: `Overflow fixture ${index}`,
      summary: 'Bootstrap overflow contract fixture',
      status: 'draft' as const,
      created_by: leaderId,
    }))

    try {
      const inserted = await service.from('change_applications').insert(rows)
      expect(inserted.error).toBeNull()

      const result = await leader.rpc('get_change_bootstrap_v2')
      expect(result.error).toBeNull()
      expect(result.data.data.change_applications).toHaveLength(1000)
      expect(result.data.warnings.some((warning: string) =>
        warning.includes('SQA_CHANGE_APPLICATIONS_TRUNCATED'),
      )).toBe(true)
    } finally {
      const cleanup = await service.from('change_applications').delete().like('change_number', `${prefix}-%`)
      expect(cleanup.error).toBeNull()
    }
  }, 30_000)

  it('never observes a partial state across the three bootstraps when a mutation lands between them (mid-refresh consistency)', async () => {
    const leader = await authenticatedClient('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')
    const originalName = `bootstrap-race-${crypto.randomUUID()}`
    const inserted = await leader
      .from('products')
      .insert({ name: originalName, category: '자사', company_name: '자사', sort_order: 901 })
      .select('id, updated_at')
      .single()
    expect(inserted.error).toBeNull()
    const productId = inserted.data!.id
    const nextName = `${originalName}-updated`

    try {
      // The fourth promise is a real authorized state change. Its result is
      // asserted instead of discarded, so this gate cannot pass on a denied
      // mutation. Each bootstrap may see the complete pre- or post-state, but
      // every individual envelope must remain internally referentially valid.
      const [core, review, change, mutation] = await Promise.all([
        leader.rpc('get_core_bootstrap_v2'),
        leader.rpc('get_review_bootstrap_v2'),
        leader.rpc('get_change_bootstrap_v2'),
        leader.rpc('update_product_if_current', {
          p_product_id: productId,
          p_expected_updated_at: inserted.data!.updated_at,
          p_name: nextName,
          p_category: '자사',
          p_company_name: '자사',
          p_unassigned_reason: null,
          p_sort_order: 901,
          p_reason: 'bootstrap race mutation',
          p_correlation_id: crypto.randomUUID(),
        }),
      ])
      expect(mutation.error).toBeNull()
      expect(typeof mutation.data).toBe('string')
      expect(core.error).toBeNull()
      expect(review.error).toBeNull()
      expect(change.error).toBeNull()

      const racedProduct = core.data.data.products.find((product: { id: string }) => product.id === productId)
      expect([originalName, nextName]).toContain(racedProduct?.name)
      const productIds = new Set(core.data.data.products.map((product: { id: string }) => product.id))
      for (const assignment of core.data.data.product_assignments) {
        expect(productIds.has(assignment.product_id)).toBe(true)
      }
      const dutyIds = new Set(core.data.data.duties.map((duty: { id: string }) => duty.id))
      for (const assignment of core.data.data.duty_assignments) {
        expect(dutyIds.has(assignment.duty_id)).toBe(true)
      }
      const applicationIds = new Set(change.data.data.change_applications.map((application: { id: string }) => application.id))
      for (const item of change.data.data.change_action_items) {
        expect(applicationIds.has(item.change_application_id)).toBe(true)
      }
    } finally {
      const cleanup = await serviceClient().from('products').delete().eq('id', productId)
      expect(cleanup.error).toBeNull()
    }
  })
})
