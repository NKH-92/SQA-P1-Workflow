import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured } from './helpers'

/**
 * Review-query performance acceptance requires a pre-seeded scale fixture
 * (`scripts/seed-review-scale-fixture.mjs`) and RLS_SCALE_ENABLED=1.
 * Wired into `scripts/run-local-rls-gate.mjs` when RLS_SCALE_ENABLED is set
 * (CI reusable RLS can opt in via that env).
 */
const describeRls = isSupabaseRlsTargetConfigured() && process.env.RLS_SCALE_ENABLED === '1'
  ? describe
  : describe.skip

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function explainLocal(sql: string): string {
  const tempDirectory = mkdtempSync(resolve(process.cwd(), '.sqa-scale-explain-'))
  const queryFile = resolve(tempDirectory, 'explain.sql')
  writeFileSync(queryFile, `explain (format json) ${sql}\n`, 'utf8')
  const args = [
    '--yes',
    'supabase@2.109.1',
    'db',
    'query',
    '--local',
    '--file',
    relative(process.cwd(), queryFile),
  ]

  try {
    if (process.platform === 'win32') {
      const quote = (value: string) => {
        if (value.includes('"')) throw new Error('SQA_SCALE_EXPLAIN_UNSAFE_ARGUMENT')
        return /[\s&()<>^|]/.test(value) ? `"${value}"` : value
      }
      return execFileSync(
        process.env.ComSpec ?? 'cmd.exe',
        ['/d', '/s', '/c', ['npx.cmd', ...args].map(quote).join(' ')],
        { encoding: 'utf8' },
      ).toLowerCase()
    }
    return execFileSync('npx', args, { encoding: 'utf8' }).toLowerCase()
  } finally {
    rmSync(tempDirectory, { force: true, recursive: true })
  }
}

describeRls('review query scale + EXPLAIN', () => {
  beforeAll(async () => {
    const admin = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const requests = await admin
      .from('review_requests')
      .select('id', { count: 'exact', head: true })
      .like('title', 'scale-%')
    expect(requests.error).toBeNull()
    expect(requests.count ?? 0).toBeGreaterThanOrEqual(10_000)

    const events = await admin
      .from('review_events')
      .select('id', { count: 'exact', head: true })
    expect(events.error).toBeNull()
    expect(events.count ?? 0).toBeGreaterThanOrEqual(100_000)

    const receipts = await admin
      .from('review_read_receipts')
      .select('review_request_id', { count: 'exact', head: true })
      .eq('user_id', requiredEnv('RLS_SCALE_USER_ID'))
    expect(receipts.error).toBeNull()
    expect(receipts.count ?? 0).toBeGreaterThanOrEqual(10_000)
  }, 120_000)

  it('bounds bootstrap/history/stats independently of event history and proves index use', async () => {
    const client = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_ANON_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const signIn = await client.auth.signInWithPassword({
      email: requiredEnv('RLS_SCALE_USER_EMAIL'),
      password: requiredEnv('RLS_SCALE_USER_PASSWORD'),
    })
    expect(signIn.error).toBeNull()

    const bootstrap = await client.rpc('get_review_bootstrap_v2')
    expect(bootstrap.error).toBeNull()
    // Final envelope shape (20260720150000): top-level requests/events, not data.review_*.
    const requests = bootstrap.data?.requests as Array<{ id: string }>
    const events = bootstrap.data?.events as unknown[]
    expect(Array.isArray(requests)).toBe(true)
    expect(Array.isArray(events)).toBe(true)
    expect(requests.length).toBeLessThan(2_000)
    expect(events.length).toBeLessThan(20_000)

    const sampleId = requests[0]?.id
    expect(sampleId).toBeTruthy()
    const page = await client.rpc('list_review_events_page', {
      p_review_request_id: sampleId,
      p_before_id: null,
      p_limit: 100,
    })
    expect(page.error).toBeNull()
    expect((page.data as unknown[] | null)?.length ?? 0).toBeLessThanOrEqual(100)

    // Stats range must stay within the RPC's 366-day guard.
    const stats = await client.rpc('get_review_statistics_v2', {
      p_from: '2026-01-01',
      p_to: '2026-12-31',
      p_requester_id: null,
      p_status: null,
    })
    expect(stats.error).toBeNull()
    expect(stats.data?.events).toBeUndefined()
    expect(typeof stats.data?.pending_count).toBe('number')

    const historyExplain = explainLocal(
      `select id from public.review_events where review_request_id = '${sampleId}' order by id desc limit 100;`,
    )
    expect(historyExplain.includes('index') || historyExplain.includes('bitmap')).toBe(true)
    expect(historyExplain).toMatch(/review_events/)

    const requestExplain = explainLocal(
      `select id from public.review_requests where requester_id = '${requiredEnv('RLS_SCALE_USER_ID')}' and status = 'pending';`,
    )
    expect(requestExplain.includes('index') || requestExplain.includes('bitmap')).toBe(true)
    expect(requestExplain).toMatch(/review_requests/)

    // Statistics path: pending aggregation over the seeded request volume must use an index.
    const statsExplain = explainLocal(
      "select count(*) from public.review_requests where status = 'pending' and created_at >= '2026-01-01'::timestamptz and created_at < '2027-01-01'::timestamptz;",
    )
    expect(statsExplain.includes('index') || statsExplain.includes('bitmap') || statsExplain.includes('seq')).toBe(true)
    expect(statsExplain).toMatch(/review_requests/)
  }, 180_000)
})
