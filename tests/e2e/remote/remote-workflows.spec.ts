import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Locator } from '@playwright/test'
import {
  assertNoServiceRoleInBrowserEnv,
  expectAccessBlocked,
  expectAppShell,
  fixtureEnv,
  isRemoteE2EConfigured,
  REMOTE_E2E_SKIP_NOTE,
  signIn,
} from './helpers'

assertNoServiceRoleInBrowserEnv()

const describeRemote = isRemoteE2EConfigured() ? test.describe : test.describe.skip

async function requireVisible(locator: Locator, label: string) {
  await expect(locator, `required control missing: ${label}`).toBeVisible({ timeout: 45_000 })
  return locator
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function supabaseAnon(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('Missing SUPABASE_URL/ANON for remote E2E helper RPC')
  return createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function signInClient(email: string, password: string) {
  const client = supabaseAnon()
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

function serviceRoleClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY required for Node-side remote E2E setup only')
  }
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

describeRemote(`remote Supabase browser E2E (${REMOTE_E2E_SKIP_NOTE})`, () => {
  test('R-E2E-01 uninvited Auth user cannot load app data', async ({ page }) => {
    await signIn(page, fixtureEnv('REMOTE_E2E_UNINVITED_EMAIL'), fixtureEnv('REMOTE_E2E_UNINVITED_PASSWORD'))
    await expectAccessBlocked(page)
    await expect(page.getByRole('button', { name: '검토 통계', exact: true })).toHaveCount(0)
  })

  test('R-E2E-02 must_change_password blocks reads and writes', async ({ page }) => {
    await signIn(
      page,
      fixtureEnv('REMOTE_E2E_PENDING_PASSWORD_EMAIL'),
      fixtureEnv('REMOTE_E2E_PENDING_PASSWORD_PASSWORD'),
    )
    await expect(page.getByText(/비밀번호를 변경|비밀번호 변경 필요/i)).toBeVisible({ timeout: 45_000 })
    await expect(page.getByRole('button', { name: /^내 검토요청/ })).toHaveCount(0)

    const client = await signInClient(
      fixtureEnv('REMOTE_E2E_PENDING_PASSWORD_EMAIL'),
      fixtureEnv('REMOTE_E2E_PENDING_PASSWORD_PASSWORD'),
    )
    const read = await client.from('review_requests').select('id').limit(1)
    // PostgREST SELECT under RLS hides rows with an empty result rather than an
    // authorization error. Either shape would block disclosure, but the local
    // policy contract is specifically a successful empty collection.
    expect(read.error).toBeNull()
    expect(read.data, 'pending-password read must disclose no rows').toEqual([])
    const write = await client.from('products').insert({ name: `blocked-${Date.now()}` })
    expect(write.error, 'pending-password write must fail closed').not.toBeNull()
  })

  test('R-E2E-03 password change unlocks first data load', async ({ page }) => {
    const email = fixtureEnv('REMOTE_E2E_PENDING_PASSWORD_EMAIL')
    const oldPassword = fixtureEnv('REMOTE_E2E_PENDING_PASSWORD_PASSWORD')
    const nextPassword = fixtureEnv('REMOTE_E2E_PENDING_PASSWORD_NEXT')
    await signIn(page, email, oldPassword)
    await expect(page.getByRole('heading', { name: '비밀번호 변경 필요' })).toBeVisible({ timeout: 45_000 })
    await (await requireVisible(page.getByLabel('새 비밀번호', { exact: true }), 'new password')).fill(nextPassword)
    await (await requireVisible(page.getByLabel('새 비밀번호 확인', { exact: true }), 'confirm password')).fill(nextPassword)
    await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click()
    await expectAppShell(page)
  })

  test('R-E2E-04 member cannot access another member review data', async ({ page }) => {
    await signIn(page, fixtureEnv('REMOTE_E2E_MEMBER_A_EMAIL'), fixtureEnv('REMOTE_E2E_MEMBER_A_PASSWORD'))
    await expectAppShell(page)
    await page.getByRole('button', { name: /^내 검토요청/ }).click()
    const foreignTitle = fixtureEnv('REMOTE_E2E_MEMBER_B_REVIEW_TITLE')
    await expect(page.getByText(foreignTitle, { exact: true })).toHaveCount(0)
  })

  test('R-E2E-05 leader reject → member resubmit → leader approve', async ({ page }) => {
    const reviewTitle = 'Member A pending'

    await signIn(page, fixtureEnv('REMOTE_E2E_LEADER_EMAIL'), fixtureEnv('REMOTE_E2E_LEADER_PASSWORD'))
    await expectAppShell(page)
    await page.goto('/#/reviews')
    await expect(page.getByText(reviewTitle, { exact: true }).first()).toBeVisible({ timeout: 45_000 })
    await page.getByText(reviewTitle, { exact: true }).first().click()
    const detail = page.getByRole('article').filter({ hasText: reviewTitle }).first()
    await (await requireVisible(
      detail.getByRole('textbox', { name: /검토 피드백/i }),
      'reject reason',
    )).fill('remote e2e reject reason')
    await (await requireVisible(detail.getByRole('button', { name: /반려/ }), 'reject')).click()
    const rejectDialog = page.getByRole('dialog', { name: '검토요청을 반려할까요?' })
    await expect(rejectDialog).toBeVisible()
    await rejectDialog.getByRole('button', { name: '반려하기', exact: true }).click()
    await expect(page.getByText('검토요청을 반려했습니다.', { exact: true })).toBeVisible({ timeout: 30_000 })

    await signIn(page, fixtureEnv('REMOTE_E2E_MEMBER_A_EMAIL'), fixtureEnv('REMOTE_E2E_MEMBER_A_PASSWORD'))
    await page.getByRole('button', { name: /^내 검토요청/ }).click()
    await expect(page.getByText(reviewTitle, { exact: true }).first()).toBeVisible({ timeout: 45_000 })
    await page.getByText(reviewTitle, { exact: true }).first().click()
    const memberDetail = page.getByRole('article').filter({ hasText: reviewTitle }).first()
    await (await requireVisible(
      memberDetail.getByRole('textbox', { name: /재검토 요청 내용/i }),
      'resubmit feedback',
    )).fill('remote e2e resubmit feedback')
    await (await requireVisible(memberDetail.getByRole('button', { name: /재검토|재제출|재요청/ }), 'resubmit')).click()
    const resubmitDialog = page.getByRole('dialog', { name: '재검토를 요청할까요?' })
    await expect(resubmitDialog).toBeVisible()
    await resubmitDialog.getByRole('button', { name: '재검토 요청', exact: true }).click()
    await expect(page.getByText('같은 검토요청으로 재검토를 요청했습니다.', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    })

    await signIn(page, fixtureEnv('REMOTE_E2E_LEADER_EMAIL'), fixtureEnv('REMOTE_E2E_LEADER_PASSWORD'))
    await page.goto('/#/reviews')
    await expect(page.getByText(reviewTitle, { exact: true }).first()).toBeVisible({ timeout: 45_000 })
    await page.getByText(reviewTitle, { exact: true }).first().click()
    const leaderDetail = page.getByRole('article').filter({ hasText: reviewTitle }).first()
    await (await requireVisible(leaderDetail.getByRole('button', { name: /완료 처리|승인/ }), 'approve')).click()
    const approveDialog = page.getByRole('dialog', { name: '검토요청을 완료 처리할까요?' })
    await expect(approveDialog).toBeVisible()
    await approveDialog.getByRole('button', { name: '완료 처리', exact: true }).click()
    await expect(page.getByText('검토요청 상태를 변경했습니다.', { exact: true })).toBeVisible({
      timeout: 30_000,
    })
  })

  test('R-E2E-06 stale review OCC surfaces a user message', async ({ page }) => {
    const reviewId = fixtureEnv('REMOTE_E2E_HARDENED_OCC_REVIEW_REQUEST_ID')
    const reviewTitle = 'Hardened OCC approval fixture'

    await signIn(page, fixtureEnv('REMOTE_E2E_LEADER_EMAIL'), fixtureEnv('REMOTE_E2E_LEADER_PASSWORD'))
    await expectAppShell(page)
    await page.goto('/#/reviews')
    await expect(page.getByText(reviewTitle, { exact: true }).first()).toBeVisible({ timeout: 45_000 })
    await page.getByText(reviewTitle, { exact: true }).first().click()
    const detail = page.getByRole('article').filter({ hasText: reviewTitle }).first()
    await expect(detail.getByRole('button', { name: /완료 처리|승인/ })).toBeVisible()

    // Pause the approval RPC after the browser has captured its expected revision,
    // then advance updated_at. This keeps Realtime refreshes from racing the test
    // setup and guarantees the request reaching PostgREST is genuinely stale.
    const member = await signInClient(
      fixtureEnv('REMOTE_E2E_MEMBER_A_EMAIL'),
      fixtureEnv('REMOTE_E2E_MEMBER_A_PASSWORD'),
    )
    const snapshot = await member
      .from('review_requests')
      .select('updated_at, description, due_date')
      .eq('id', reviewId)
      .single()
    expect(snapshot.error).toBeNull()
    let concurrentEditInjected = false
    let concurrentEditCompleted = false
    let concurrentEditError: unknown
    await page.route('**/rest/v1/rpc/approve_review_request', async (route) => {
      if (route.request().method() === 'POST' && !concurrentEditInjected) {
        concurrentEditInjected = true
        try {
          const bump = await member.rpc('update_review_request', {
            p_review_request_id: reviewId,
            p_expected_updated_at: snapshot.data!.updated_at,
            p_title: reviewTitle,
            p_description: `${snapshot.data!.description ?? ''} concurrent edit`,
            p_due_date: snapshot.data!.due_date,
          })
          concurrentEditError = bump.error
        } catch (error) {
          concurrentEditError = error
        } finally {
          concurrentEditCompleted = true
        }
      }
      await route.continue()
    })

    await detail.getByRole('button', { name: /완료 처리|승인/ }).click()
    const approveDialog = page.getByRole('dialog', { name: '검토요청을 완료 처리할까요?' })
    await expect(approveDialog).toBeVisible()
    await approveDialog.getByRole('button', { name: '완료 처리', exact: true }).click()
    await expect.poll(
      () => concurrentEditCompleted,
      { message: 'approval RPC must pass through the OCC race gate', timeout: 15_000 },
    ).toBe(true)
    expect(concurrentEditError, 'concurrent owner edit must succeed to create stale state').toBeNull()
    await expect(page.getByText(/다른 사용자가 변경했습니다|새로고침 후 다시 시도/i).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('R-E2E-07 inactive session is blocked on next API access', async ({ page }) => {
    const email = fixtureEnv('REMOTE_E2E_DEACTIVATE_MEMBER_EMAIL')
    const password = fixtureEnv('REMOTE_E2E_DEACTIVATE_MEMBER_PASSWORD')
    const userId = fixtureEnv('REMOTE_E2E_DEACTIVATE_MEMBER_USER_ID')
    const admin = serviceRoleClient()

    try {
      const client = await signInClient(email, password)
      const before = await client.from('review_requests').select('id').limit(1)
      expect(before.error, 'active session must read before deactivation').toBeNull()

      // Deactivate via service role in Node only (never exposed as VITE_*).
      const deactivated = await admin.from('profiles').update({ is_active: false }).eq('id', userId)
      expect(deactivated.error).toBeNull()

      await signIn(page, email, password)
      await expectAccessBlocked(page)
      const next = await client.from('review_requests').select('id').limit(1)
      expect(next.error).toBeNull()
      expect(next.data, 'next API access after deactivation must disclose no rows').toEqual([])
    } finally {
      await admin.from('profiles').update({ is_active: true }).eq('id', userId)
    }
  })

  test('R-E2E-08 assigned change-task owner succeeds; other user fails', async ({ page }) => {
    const taskId = fixtureEnv('REMOTE_E2E_OWNED_CHANGE_TASK_ID')
    const otherMember = await signInClient(
      fixtureEnv('REMOTE_E2E_MEMBER_B_EMAIL'),
      fixtureEnv('REMOTE_E2E_MEMBER_B_PASSWORD'),
    )
    const admin = serviceRoleClient()
    const beforeDeniedAttempt = await admin
      .from('product_change_tasks')
      .select('status, updated_at, product_id')
      .eq('id', taskId)
      .single()
    expect(beforeDeniedAttempt.error).toBeNull()
    expect(beforeDeniedAttempt.data?.status).toBe('pending')
    const ownedProduct = await admin
      .from('products')
      .select('name')
      .eq('id', beforeDeniedAttempt.data!.product_id)
      .single()
    expect(ownedProduct.error).toBeNull()

    const denied = await otherMember.rpc('complete_product_change_task', {
      p_task_id: taskId,
      p_completion_note: 'unauthorized completion attempt',
      p_proxy_reason: null,
    })
    expect(denied.error).not.toBeNull()
    expect(denied.error!.message).toContain('designated active assignee required')
    const afterDeniedAttempt = await admin
      .from('product_change_tasks')
      .select('status, updated_at')
      .eq('id', taskId)
      .single()
    expect(afterDeniedAttempt.error).toBeNull()
    expect(afterDeniedAttempt.data).toEqual({
      status: beforeDeniedAttempt.data!.status,
      updated_at: beforeDeniedAttempt.data!.updated_at,
    })

    await signIn(page, fixtureEnv('REMOTE_E2E_MEMBER_B_EMAIL'), fixtureEnv('REMOTE_E2E_MEMBER_B_PASSWORD'))
    await page.getByRole('button', { name: /^변경 적용/ }).click()
    await page.getByRole('textbox', { name: '변경 적용 검색' }).fill(ownedProduct.data!.name)
    await expect(page
      .getByRole('navigation', { name: '적용대상 제품 목록' })
      .getByRole('button', { name: new RegExp(`^${escapeRegExp(ownedProduct.data!.name)}(?:\\s|$)`) }))
      .toHaveCount(0)

    await signIn(page, fixtureEnv('REMOTE_E2E_MEMBER_A_EMAIL'), fixtureEnv('REMOTE_E2E_MEMBER_A_PASSWORD'))
    await expectAppShell(page)
    await page.getByRole('button', { name: /^변경 적용/ }).click()
    await page.getByRole('textbox', { name: '변경 적용 검색' }).fill(ownedProduct.data!.name)
    const ownedProductButton = await requireVisible(page
      .getByRole('navigation', { name: '적용대상 제품 목록' })
      .getByRole('button', { name: new RegExp(`^${escapeRegExp(ownedProduct.data!.name)}(?:\\s|$)`) }), 'owned product')
    await ownedProductButton.click()
    const complete = await requireVisible(page
      .getByRole('region', { name: `${ownedProduct.data!.name} 변경관리 내용` })
      .getByRole('button', { name: '적용 완료' }), 'complete task')
    await complete.click()
    const dialog = page.getByRole('dialog', { name: '실제로 적용을 완료했습니까?' })
    await expect(dialog).toBeVisible()
    await dialog.getByPlaceholder('예: 제품표준서 Rev.12 반영').fill('remote e2e evidence')
    await dialog.getByRole('button', { name: '완료 확인' }).click()
    await expect(page.getByText(/적용업무를 완료했습니다|완료/i).first()).toBeVisible({ timeout: 30_000 })

    const completed = await admin
      .from('product_change_tasks')
      .select('status, completion_note')
      .eq('id', taskId)
      .single()
    expect(completed.error).toBeNull()
    expect(completed.data).toMatchObject({ status: 'completed', completion_note: 'remote e2e evidence' })
  })

  test('R-E2E-09 master stale OCC is rejected with unified message', async ({ page }) => {
    const productId = fixtureEnv('REMOTE_E2E_TEST_PRODUCT_ID')

    await signIn(page, fixtureEnv('REMOTE_E2E_LEADER_EMAIL'), fixtureEnv('REMOTE_E2E_LEADER_PASSWORD'))
    await expectAppShell(page)
    await page.goto('/#/products')
    await expect(page.getByRole('heading', { name: /제품 마스터|제품/i }).first()).toBeVisible({ timeout: 45_000 })

    const leader = await signInClient(
      fixtureEnv('REMOTE_E2E_LEADER_EMAIL'),
      fixtureEnv('REMOTE_E2E_LEADER_PASSWORD'),
    )
    const leaderB = await signInClient(
      fixtureEnv('REMOTE_E2E_LEADER_B_EMAIL'),
      fixtureEnv('REMOTE_E2E_LEADER_B_PASSWORD'),
    )
    const snapshot = await leader
      .from('products')
      .select('updated_at, name, category, company_name, sort_order')
      .eq('id', productId)
      .single()
    expect(snapshot.error).toBeNull()
    const originalName = snapshot.data!.name

    // Open edit first so the UI captures the stale expectedUpdatedAt, then advance revision.
    const productCard = page.locator('article.master-card').filter({
      has: page.getByRole('heading', { name: originalName, exact: true }),
    })
    await (await requireVisible(productCard.getByTitle('제품 수정'), 'product edit')).click()
    const nameInput = page.getByRole('textbox', { name: '제품명', exact: true })
    await expect(nameInput).toHaveValue(originalName)
    await nameInput.fill(`${originalName}-stale-ui`)

    const concurrent = await leaderB.rpc('update_product_if_current', {
      p_product_id: productId,
      p_expected_updated_at: snapshot.data!.updated_at,
      p_name: `${originalName}-b`,
      p_category: snapshot.data!.category,
      p_company_name: snapshot.data!.company_name,
      p_unassigned_reason: null,
      p_sort_order: snapshot.data!.sort_order,
      p_reason: 'concurrent product edit',
      p_correlation_id: crypto.randomUUID(),
    })
    expect(concurrent.error).toBeNull()

    await page.getByRole('button', { name: '저장', exact: true }).click()
    const reasonDialog = page.getByRole('dialog', { name: '제품 정보 변경 사유' })
    await expect(reasonDialog).toBeVisible()
    await reasonDialog.getByRole('textbox').fill('stale UI save attempt')
    await reasonDialog.getByRole('button', { name: '수정 저장' }).click()
    await expect(page.getByText(/다른 사용자가 변경했습니다|새로고침 후 다시 시도/i).first()).toBeVisible({
      timeout: 15_000,
    })

    const stale = await leader.rpc('update_product_if_current', {
      p_product_id: productId,
      p_expected_updated_at: snapshot.data!.updated_at,
      p_name: `${originalName}-stale`,
      p_category: snapshot.data!.category,
      p_company_name: snapshot.data!.company_name,
      p_unassigned_reason: null,
      p_sort_order: snapshot.data!.sort_order,
      p_reason: 'stale product edit',
      p_correlation_id: crypto.randomUUID(),
    })
    expect(stale.error).not.toBeNull()
    expect(stale.error!.message).toMatch(/changed since it was opened|master record/)
  })

  test('R-E2E-10 authoritative audit is leader-only', async ({ page }) => {
    await signIn(page, fixtureEnv('REMOTE_E2E_MEMBER_A_EMAIL'), fixtureEnv('REMOTE_E2E_MEMBER_A_PASSWORD'))
    await expectAppShell(page)
    await expect(page.getByRole('button', { name: '활동 로그', exact: true })).toHaveCount(0)

    const member = await signInClient(
      fixtureEnv('REMOTE_E2E_MEMBER_A_EMAIL'),
      fixtureEnv('REMOTE_E2E_MEMBER_A_PASSWORD'),
    )
    const denied = await member.rpc('list_audit_events', { p_limit: 10, p_before_id: null as unknown as number })
    // Leaders may execute; members must be rejected by the RPC body (active leader required).
    expect(denied.error, 'member must not list authoritative audit events').not.toBeNull()

    await signIn(page, fixtureEnv('REMOTE_E2E_LEADER_EMAIL'), fixtureEnv('REMOTE_E2E_LEADER_PASSWORD'))
    await expectAppShell(page)
    const auditNav = await requireVisible(page.getByRole('button', { name: /^활동 로그/ }), 'audit nav')
    await auditNav.click()
    await expect(page.getByRole('heading', { name: /활동/i }).first()).toBeVisible()
  })

  test('R-E2E-11 runs against production build static assets', async ({ page }) => {
    expect(process.env.REMOTE_E2E_USE_BUILT_SERVER).toBe('1')
    await page.goto('/')
    const version = await page.evaluate(async () => {
      const response = await fetch('/version.json', { cache: 'no-store' })
      if (!response.ok) return null
      return response.json() as Promise<{ sha?: string; schemaVersion?: number }>
    })
    expect(version).toBeTruthy()
    expect(version?.schemaVersion).toBe(1)
    expect(typeof version?.sha).toBe('string')
  })

  test('R-E2E-12 logout clears previous session UI refill', async ({ page }) => {
    await signIn(page, fixtureEnv('REMOTE_E2E_LEADER_EMAIL'), fixtureEnv('REMOTE_E2E_LEADER_PASSWORD'))
    await expectAppShell(page)

    let releaseDelayedResponse: (() => void) | null = null
    const delayedGate = new Promise<void>((resolve) => {
      releaseDelayedResponse = resolve
    })
    let markDelayedRequestSeen: (() => void) | null = null
    const delayedRequestSeen = new Promise<void>((resolve) => {
      markDelayedRequestSeen = resolve
    })
    await page.route('**/rest/v1/rpc/get_review_bootstrap_v2', async (route) => {
      if (route.request().method() === 'POST') {
        markDelayedRequestSeen?.()
        await delayedGate
      }
      await route.continue()
    })

    await page.getByTitle('새로고침').click()
    await expect.poll(() => Promise.race([
      delayedRequestSeen.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 250)),
    ]), { timeout: 15_000 }).toBe(true)
    const logout = await requireVisible(page.getByRole('button', { name: /로그아웃|logout/i }).first(), 'logout')
    await logout.click()
    await expect(page.getByLabel(/이메일|email/i).first()).toBeVisible({ timeout: 30_000 })
    releaseDelayedResponse?.()
    await page.waitForTimeout(1_000)
    await expect(page.getByRole('button', { name: '검토 통계', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '홈', exact: true })).toHaveCount(0)
  })

  test('R-E2E-13 review statistics refetch after a review event refresh', async ({ page }) => {
    const admin = serviceRoleClient()
    const reviewRequestId = fixtureEnv('REMOTE_E2E_STATS_REVIEW_REQUEST_ID')
    let insertedEventId: string | number | null = null

    await signIn(page, fixtureEnv('REMOTE_E2E_LEADER_EMAIL'), fixtureEnv('REMOTE_E2E_LEADER_PASSWORD'))
    await expectAppShell(page)

    let statisticsCalls = 0
    await page.route('**/rest/v1/rpc/get_review_statistics_v2', async (route) => {
      statisticsCalls += 1
      await route.continue()
    })

    try {
      await page.goto('/#/review-stats')
      const requestKpi = page.getByRole('article', { name: /^요청 건수 [\d,]+건$/ }).first()
      await expect(requestKpi).toBeVisible({ timeout: 45_000 })
      const readRequestCount = async () => {
        const label = await requestKpi.getAttribute('aria-label')
        const match = label?.match(/([\d,]+)건/)
        if (!match) throw new Error(`Unexpected request KPI label: ${label}`)
        return Number(match[1].replaceAll(',', ''))
      }
      const beforeCount = await readRequestCount()
      const beforeCalls = statisticsCalls

      const inserted = await admin
        .from('review_events')
        .insert({
          review_request_id: reviewRequestId,
          actor_id: null,
          actor_name_snapshot: 'Remote E2E',
          event_type: 'submitted',
          from_status: null,
          to_status: 'pending',
          occurred_at: new Date().toISOString(),
          metadata: { remote_e2e: true },
        })
        .select('id')
        .single()
      expect(inserted.error).toBeNull()
      insertedEventId = inserted.data?.id ?? null
      expect(insertedEventId).not.toBeNull()

      await page.getByTitle('새로고침').click()
      await expect.poll(() => statisticsCalls, {
        message: 'review statistics RPC must refetch after refreshed review-event content changes',
        timeout: 30_000,
      }).toBeGreaterThan(beforeCalls)
      await expect.poll(readRequestCount, { timeout: 30_000 }).toBe(beforeCount + 1)
    } finally {
      if (insertedEventId !== null) {
        const cleanup = await admin.from('review_events').delete().eq('id', insertedEventId)
        expect(cleanup.error).toBeNull()
      }
    }
  })
})
