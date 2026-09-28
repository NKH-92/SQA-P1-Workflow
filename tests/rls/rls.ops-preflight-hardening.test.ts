import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured, RLS_SKIP_NOTE } from './helpers'

const describeRls = isSupabaseRlsTargetConfigured() ? describe : describe.skip
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }
const createdInvites: string[] = []
const createdLogs: string[] = []

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Set ${name}`)
  return value
}

function serviceClient() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), clientOptions)
}

async function signedIn(emailName: string, passwordName: string) {
  const client = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), clientOptions)
  const { error } = await client.auth.signInWithPassword({
    email: requiredEnv(emailName),
    password: requiredEnv(passwordName),
  })
  expect(error).toBeNull()
  return client
}

async function inviteByEmail(email: string) {
  const invite = await serviceClient()
    .from('allowed_users')
    .select('id,email,name,role,updated_at')
    .eq('email', email)
    .single()
  expect(invite.error).toBeNull()
  return invite.data!
}

function updateInvite(
  client: SupabaseClient,
  invite: { id: string; name: string; role: string; updated_at: string },
  email: string,
) {
  return client.rpc('update_allowed_user_if_current', {
    p_allowed_user_id: invite.id,
    p_expected_updated_at: invite.updated_at,
    p_email: email,
    p_name: invite.name,
    p_role: invite.role,
    p_reason: 'RLS account guard probe',
    p_correlation_id: crypto.randomUUID(),
  })
}

function deleteInvite(client: SupabaseClient, invite: { id: string; updated_at: string }) {
  return client.rpc('delete_allowed_user_if_current', {
    p_id: invite.id,
    p_expected_updated_at: invite.updated_at,
    p_reason: 'RLS account guard probe',
    p_correlation_id: crypto.randomUUID(),
  })
}

afterEach(async () => {
  if (!isSupabaseRlsTargetConfigured()) return
  const service = serviceClient()
  if (createdInvites.length) await service.from('allowed_users').delete().in('id', createdInvites.splice(0))
  if (createdLogs.length) await service.from('activity_logs').delete().in('id', createdLogs.splice(0))
})

/**
 * Ops preflight hardening (supabase/migrations/20260928090000_ops_preflight_hardening.sql):
 * a signed-up account cannot drop out of the account list, and the
 * initPlan-cached activity_logs policy keeps exactly the same visibility.
 */
describeRls(`RLS ops preflight hardening (${RLS_SKIP_NOTE})`, () => {
  it('refuses to delete the list row of an active account and keeps the row', async () => {
    const leader = await signedIn('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')
    const invite = await inviteByEmail(requiredEnv('RLS_MEMBER_A_EMAIL'))

    const refused = await deleteInvite(leader, invite)
    expect(refused.error).not.toBeNull()
    expect(refused.error!.details).toBe('SQA_ACCOUNT_ACTIVE')

    const after = await inviteByEmail(requiredEnv('RLS_MEMBER_A_EMAIL'))
    expect(after.id).toBe(invite.id)
    expect(after.updated_at).toBe(invite.updated_at)
  })

  it('still deletes the list row of a deactivated account through the versioned RPC', async () => {
    const leader = await signedIn('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')
    const service = serviceClient()
    const inactiveEmail = requiredEnv('RLS_INACTIVE_MEMBER_EMAIL')
    const invite = await inviteByEmail(inactiveEmail)

    try {
      const deleted = await deleteInvite(leader, invite)
      expect(deleted.error).toBeNull()
      expect(deleted.data).toBe(invite.name)
      const gone = await service.from('allowed_users').select('id').eq('id', invite.id)
      expect(gone.error).toBeNull()
      expect(gone.data).toEqual([])
    } finally {
      const existing = await service.from('allowed_users').select('id').eq('email', inactiveEmail)
      if (!existing.data?.length) {
        const restored = await service.from('allowed_users').insert({
          email: invite.email,
          name: invite.name,
          role: invite.role,
        })
        expect(restored.error).toBeNull()
      }
    }
  })

  it('refuses to change the email of a row linked to a profile, active or not', async () => {
    const leader = await signedIn('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')

    for (const emailName of ['RLS_MEMBER_A_EMAIL', 'RLS_INACTIVE_MEMBER_EMAIL']) {
      const invite = await inviteByEmail(requiredEnv(emailName))
      const refused = await updateInvite(leader, invite, `moved-${crypto.randomUUID()}@example.test`)
      expect(refused.error).not.toBeNull()
      expect(refused.error!.details).toBe('SQA_ACCOUNT_EMAIL_LOCKED')

      const after = await inviteByEmail(requiredEnv(emailName))
      expect(after.email).toBe(invite.email)
      expect(after.updated_at).toBe(invite.updated_at)
    }
  })

  it('keeps a linked row editable when the email only changes case (no-op)', async () => {
    const leader = await signedIn('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')
    const invite = await inviteByEmail(requiredEnv('RLS_MEMBER_A_EMAIL'))

    const noop = await updateInvite(leader, invite, invite.email.toUpperCase())
    expect(noop.error).toBeNull()
    expect(noop.data).toBe(invite.updated_at)
  })

  it('still lets an unlinked invite change its email and be deleted', async () => {
    const leader = await signedIn('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')
    const inserted = await serviceClient()
      .from('allowed_users')
      .insert({ email: `rls-unlinked-${crypto.randomUUID()}@example.test`, name: 'RLS Unlinked Invite', role: 'member' })
      .select('id,email,name,role,updated_at')
      .single()
    expect(inserted.error).toBeNull()
    createdInvites.push(inserted.data!.id)

    const nextEmail = `rls-unlinked-${crypto.randomUUID()}@example.test`
    const updated = await updateInvite(leader, inserted.data!, nextEmail)
    expect(updated.error).toBeNull()
    expect(updated.data).not.toBe(inserted.data!.updated_at)

    const deleted = await deleteInvite(leader, { id: inserted.data!.id, updated_at: updated.data as string })
    expect(deleted.error).toBeNull()
    expect(deleted.data).toBe('RLS Unlinked Invite')
  })

  it('keeps activity log visibility unchanged for every role', async () => {
    const leaderId = requiredEnv('RLS_LEADER_USER_ID')
    const memberAId = requiredEnv('RLS_MEMBER_A_USER_ID')
    const memberBId = requiredEnv('RLS_MEMBER_B_USER_ID')
    const inserted = await serviceClient().from('activity_logs').insert([
      { actor_id: memberAId, target_user_id: null, entity_type: 'review_request', entity_id: null, action: 'viewed', summary: 'RLS visibility: member A own', metadata: {} },
      { actor_id: leaderId, target_user_id: memberAId, entity_type: 'review_request', entity_id: null, action: 'viewed', summary: 'RLS visibility: member A target', metadata: {} },
      { actor_id: leaderId, target_user_id: memberBId, entity_type: 'review_request', entity_id: null, action: 'viewed', summary: 'RLS visibility: member B target', metadata: {} },
      { actor_id: leaderId, target_user_id: null, entity_type: 'review_request', entity_id: null, action: 'viewed', summary: 'RLS visibility: leader global', metadata: {} },
    ]).select('id,summary')
    expect(inserted.error).toBeNull()
    const ids = inserted.data!.map((row) => row.id)
    createdLogs.push(...ids)
    const idBySummary = new Map(inserted.data!.map((row) => [row.summary, row.id]))
    const all = [...ids].sort()
    const memberAVisible = [
      idBySummary.get('RLS visibility: member A own')!,
      idBySummary.get('RLS visibility: member A target')!,
    ].sort()

    const visibleTo = async (emailName: string, passwordName: string) => {
      const client = await signedIn(emailName, passwordName)
      const result = await client.from('activity_logs').select('id').in('id', ids)
      expect(result.error).toBeNull()
      return (result.data ?? []).map((row) => row.id).sort()
    }

    expect(await visibleTo('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')).toEqual(all)
    expect(await visibleTo('RLS_TEAM_LEADER_EMAIL', 'RLS_TEAM_LEADER_PASSWORD')).toEqual(all)
    expect(await visibleTo('RLS_MEMBER_A_EMAIL', 'RLS_MEMBER_A_PASSWORD')).toEqual(memberAVisible)
    expect(await visibleTo('RLS_MEMBER_B_EMAIL', 'RLS_MEMBER_B_PASSWORD')).toEqual([idBySummary.get('RLS visibility: member B target')!])
    expect(await visibleTo('RLS_INACTIVE_MEMBER_EMAIL', 'RLS_INACTIVE_MEMBER_PASSWORD')).toEqual([])
    expect(await visibleTo('RLS_PENDING_PASSWORD_EMAIL', 'RLS_PENDING_PASSWORD')).toEqual([])

    const newestFirst = await (await signedIn('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD'))
      .from('activity_logs')
      .select('id,created_at')
      .order('created_at', { ascending: false })
      .limit(101)
    expect(newestFirst.error).toBeNull()
    const times = (newestFirst.data ?? []).map((row) => Date.parse(row.created_at))
    expect(times).toEqual([...times].sort((left, right) => right - left))
  })
})
