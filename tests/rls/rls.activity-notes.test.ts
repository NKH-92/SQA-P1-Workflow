import { createClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured, RLS_SKIP_NOTE } from './helpers'

const describeRls = isSupabaseRlsTargetConfigured() ? describe : describe.skip
const url = process.env.SUPABASE_URL ?? ''
const anonKey = process.env.SUPABASE_ANON_KEY ?? ''
const createdNotes: string[] = []
const createdLogs: string[] = []
const createdProducts: string[] = []

afterEach(async () => {
  if (!isSupabaseRlsTargetConfigured()) return
  const service = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
  if (createdNotes.length) await service.from('profile_notes').delete().in('id', createdNotes.splice(0))
  if (createdLogs.length) await service.from('activity_logs').delete().in('id', createdLogs.splice(0))
  if (createdProducts.length) await service.from('products').delete().in('id', createdProducts.splice(0))
})

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

async function signedIn(emailName: string, passwordName: string) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } })
  const signedIn = await client.auth.signInWithPassword({
    email: required(emailName),
    password: required(passwordName),
  })
  expect(signedIn.error).toBeNull()
  return client
}

describeRls(`profile-note and activity-log INSERT ACLs (${RLS_SKIP_NOTE})`, () => {
  it('lets an active leader create a member note and still blocks member note writes', async () => {
    const leader = await signedIn('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')
    const member = await signedIn('RLS_MEMBER_A_EMAIL', 'RLS_MEMBER_A_PASSWORD')
    const leaderId = required('RLS_LEADER_USER_ID')
    const memberId = required('RLS_MEMBER_A_USER_ID')

    const allowed = await leader.from('profile_notes').insert({
      profile_id: memberId,
      leader_id: leaderId,
      note: 'RLS insert contract',
    }).select('id').single()
    expect(allowed.error).toBeNull()
    createdNotes.push(allowed.data!.id)

    const denied = await member.from('profile_notes').insert({
      profile_id: memberId,
      leader_id: memberId,
      note: 'must be denied',
    })
    expect(denied.error).not.toBeNull()
  })

  it('lets a member log their own global action and blocks actor spoofing', async () => {
    const member = await signedIn('RLS_MEMBER_A_EMAIL', 'RLS_MEMBER_A_PASSWORD')
    const memberId = required('RLS_MEMBER_A_USER_ID')
    const leaderId = required('RLS_LEADER_USER_ID')

    const allowed = await member.from('activity_logs').insert({
      actor_id: memberId,
      target_user_id: null,
      entity_type: 'review_request',
      entity_id: null,
      action: 'viewed',
      summary: 'RLS insert contract',
      metadata: {},
    }).select('id').single()
    expect(allowed.error).toBeNull()
    createdLogs.push(allowed.data!.id)

    const denied = await member.from('activity_logs').insert({
      actor_id: leaderId,
      target_user_id: null,
      entity_type: 'review_request',
      entity_id: null,
      action: 'spoofed',
      summary: 'must be denied',
      metadata: {},
    })
    expect(denied.error).not.toBeNull()
  })

  it('keeps active-leader direct delete compatibility and enforces the versioned audited delete RPC', async () => {
    const service = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
    const compat = await service.from('products').insert({
      name: `RLS compatible delete ${crypto.randomUUID()}`,
      category: '자사',
      company_name: '자사',
    }).select('id').single()
    expect(compat.error).toBeNull()
    createdProducts.push(compat.data!.id)

    const created = await service.from('products').insert({
      name: `RLS versioned delete ${crypto.randomUUID()}`,
      category: '자사',
      company_name: '자사',
    }).select('id,updated_at').single()
    expect(created.error).toBeNull()
    createdProducts.push(created.data!.id)

    const leader = await signedIn('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')
    const direct = await leader.from('products').delete().eq('id', compat.data!.id).select('id').single()
    expect(direct.error).toBeNull()
    expect(direct.data?.id).toBe(compat.data!.id)
    createdProducts.splice(createdProducts.indexOf(compat.data!.id), 1)

    const member = await signedIn('RLS_MEMBER_A_EMAIL', 'RLS_MEMBER_A_PASSWORD')
    const memberDirect = await member.from('products').delete().eq('id', created.data!.id).select('id')
    expect(memberDirect.error === null ? memberDirect.data : []).toEqual([])
    const stillExists = await service.from('products').select('id').eq('id', created.data!.id).single()
    expect(stillExists.error).toBeNull()

    const blankReason = await leader.rpc('delete_product_if_current', {
      p_id: created.data!.id,
      p_expected_updated_at: created.data!.updated_at,
      p_reason: '   ',
      p_correlation_id: crypto.randomUUID(),
    })
    expect(blankReason.error).not.toBeNull()

    const stale = await leader.rpc('delete_product_if_current', {
      p_id: created.data!.id,
      p_expected_updated_at: '2000-01-01T00:00:00.000Z',
      p_reason: 'stale delete must fail',
      p_correlation_id: crypto.randomUUID(),
    })
    expect(stale.error).not.toBeNull()

    const memberRpc = await member.rpc('delete_product_if_current', {
      p_id: created.data!.id,
      p_expected_updated_at: created.data!.updated_at,
      p_reason: 'member delete must fail',
      p_correlation_id: crypto.randomUUID(),
    })
    expect(memberRpc.error).not.toBeNull()

    const reason = 'RLS versioned delete contract'
    const deleted = await leader.rpc('delete_product_if_current', {
      p_id: created.data!.id,
      p_expected_updated_at: created.data!.updated_at,
      p_reason: reason,
      p_correlation_id: crypto.randomUUID(),
    })
    expect(deleted.error).toBeNull()
    createdProducts.splice(createdProducts.indexOf(created.data!.id), 1)

    let beforeId: string | null = null
    let auditMatch = false
    for (let pageNumber = 0; pageNumber < 20 && !auditMatch; pageNumber += 1) {
      const audit = await leader.rpc('list_audit_events_v2', { p_limit: 100, p_before_id: beforeId })
      expect(audit.error).toBeNull()
      const events = audit.data ?? []
      auditMatch = events.some((event) => event.entity_id === created.data!.id && event.reason === reason)
      if (events.length < 100) break
      beforeId = String(events[events.length - 1].id)
    }
    expect(auditMatch).toBe(true)
  })
})
