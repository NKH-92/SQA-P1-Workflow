import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured, RLS_SKIP_NOTE } from './helpers'

const suite = isSupabaseRlsTargetConfigured() ? describe : describe.skip

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

suite(`read-only team leader authorization (${RLS_SKIP_NOTE})`, () => {
  let client: SupabaseClient

  beforeAll(async () => {
    client = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error } = await client.auth.signInWithPassword({
      email: requiredEnv('RLS_TEAM_LEADER_EMAIL'),
      password: requiredEnv('RLS_TEAM_LEADER_PASSWORD'),
    })
    if (error) throw error
  })

  it('can read the complete leader workspace but cannot manage it', async () => {
    const [profiles, reviews, projects, canManage] = await Promise.all([
      client.from('profiles').select('id,role'),
      client.from('review_requests').select('id'),
      client.from('projects').select('id'),
      client.rpc('can_manage_team_data'),
    ])
    expect(profiles.error).toBeNull()
    expect(profiles.data?.some((item) => item.id === requiredEnv('RLS_MEMBER_A_USER_ID'))).toBe(true)
    expect(reviews.error).toBeNull()
    expect(reviews.data?.some((item) => item.id === requiredEnv('RLS_MEMBER_B_REVIEW_REQUEST_ID'))).toBe(true)
    expect(projects.error).toBeNull()
    expect(projects.data?.some((item) => item.id === requiredEnv('RLS_TEST_PROJECT_ID'))).toBe(true)
    expect(canManage.error).toBeNull()
    expect(canManage.data).toBe(false)

    const bootstrap = await client.rpc('get_review_bootstrap_v2')
    expect(bootstrap.error).toBeNull()
    const requests = (bootstrap.data as { requests?: Array<{ id: string }> } | null)?.requests ?? []
    expect(requests.some((item) => item.id === requiredEnv('RLS_MEMBER_B_REVIEW_REQUEST_ID'))).toBe(true)
  })

  it('can acknowledge leader-style review notifications only for itself', async () => {
    const requestId = requiredEnv('RLS_MEMBER_B_REVIEW_REQUEST_ID')
    const marked = await client.rpc('mark_review_seen', { p_review_request_id: requestId })
    expect(marked.error).toBeNull()
    expect(marked.data).not.toBeNull()

    const receipt = await client.from('review_read_receipts')
      .select('user_id,review_request_id,last_seen_event_id')
      .eq('user_id', requiredEnv('RLS_TEAM_LEADER_USER_ID'))
      .eq('review_request_id', requestId)
      .single()
    expect(receipt.error).toBeNull()
    expect(receipt.data?.user_id).toBe(requiredEnv('RLS_TEAM_LEADER_USER_ID'))
  })

  it('is rejected by the authoritative write trigger for REST and RPC writes', async () => {
    const directWrite = await client.from('products').insert({ name: `Forbidden ${crypto.randomUUID()}` })
    expect(directWrite.error?.details).toBe('SQA_TEAM_LEADER_READ_ONLY')

    const rpcWrite = await client.rpc('publish_change_application', {
      p_change_application_id: null,
      p_expected_updated_at: null,
      p_change_number: `TEAM-READONLY-${Date.now()}`,
      p_source: 'official',
      p_title: 'Forbidden team leader edit',
      p_summary: 'read only',
      p_source_url: null,
      p_effective_date: '2099-01-01',
      p_action_kind: 'product_standard',
      p_custom_kind_name: null,
      p_action_content: 'must be rejected',
      p_due_date: '2099-01-10',
      p_tasks: [{
        product_id: requiredEnv('RLS_TEST_PRODUCT_ID'),
        assignee_id: requiredEnv('RLS_MEMBER_A_USER_ID'),
        product_note: null,
      }],
    })
    expect(rpcWrite.error).not.toBeNull()
    expect(`${rpcWrite.error?.details ?? ''} ${rpcWrite.error?.message ?? ''}`)
      .toMatch(/SQA_TEAM_LEADER_READ_ONLY|SQA_ACTIVE_LEADER_REQUIRED/)
  })
})
