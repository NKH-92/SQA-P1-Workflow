import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured, RLS_SKIP_NOTE } from './helpers'

const describeRls = isSupabaseRlsTargetConfigured() ? describe : describe.skip

type Client = ReturnType<typeof createClient>
type ChangeApplicationTaskInput = {
  product_id: string
  assignee_id: string | null
  product_note?: string | null
}
type ChangeApplicationWritePayload = {
  p_change_application_id: string | null
  p_expected_updated_at: string | null
  p_change_number: string
  p_source: string
  p_title: string
  p_summary: string
  p_source_url: string | null
  p_effective_date: string
  p_action_kind: string
  p_custom_kind_name: string | null
  p_action_content: string
  p_due_date: string
  p_tasks: ChangeApplicationTaskInput[]
}
type PublishedFixture = {
  applicationId: string
  actionId: string
  changeNumber: string
  title: string
  payload: ChangeApplicationWritePayload
  tasks: Array<{
    id: string
    product_id: string
    assignee_id: string | null
    status: string
  }>
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Set ${name}`)
  return value
}

function expectContractError(
  result: { error: { code?: string; details?: string | null; message: string } | null },
  contract?: string,
) {
  expect(result.error).not.toBeNull()
  if (contract) {
    expect(`${result.error?.message ?? ''} ${result.error?.details ?? ''}`).toContain(contract)
  }
}

function historyArgs(overrides: Record<string, unknown> = {}) {
  return {
    p_result: null,
    p_query: null,
    p_from: null,
    p_to: null,
    p_product_id: null,
    p_assignee_id: null,
    p_before_history_at: null,
    p_before_id: null,
    p_limit: 50,
    ...overrides,
  }
}

describeRls(`RLS change application final approval (${RLS_SKIP_NOTE})`, () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
  const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } }
  const nonce = crypto.randomUUID()

  let admin: Client
  let anonymous: Client
  let leader: Client
  let leaderB: Client
  let memberA: Client
  let memberB: Client
  let memberAId: string
  let memberBId: string
  let inactiveMemberId: string
  let productAId: string
  let productBId: string
  let applicationSequence = 0

  const createdApplicationIds: string[] = []
  const createdTaskIds: string[] = []
  const createdProductIds: string[] = []

  async function createProduct(suffix: string): Promise<string> {
    const result = await admin
      .from('products')
      .insert({
        name: `RLS change final ${nonce} ${suffix}`,
        category: '자사',
        company_name: '자사',
      })
      .select('id')
      .single()
    expect(result.error).toBeNull()
    createdProductIds.push(result.data!.id)
    return result.data!.id
  }

  function publishPayload(
    tasks: ChangeApplicationTaskInput[],
    suffix = `CASE-${applicationSequence + 1}`,
  ) {
    applicationSequence += 1
    const changeNumber = `RLS-FINAL-${nonce.slice(0, 8)}-${applicationSequence}`
    const title = `RLS final approval ${nonce} ${suffix}`
    return {
      changeNumber,
      title,
      payload: {
        p_change_application_id: null,
        p_expected_updated_at: null,
        p_change_number: changeNumber,
        p_source: 'official',
        p_title: title,
        p_summary: `Final approval RLS fixture ${nonce}`,
        p_source_url: null,
        p_effective_date: '2099-01-01',
        p_action_kind: 'product_standard',
        p_custom_kind_name: null,
        p_action_content: `Apply controlled change ${nonce}`,
        p_due_date: '2099-01-10',
        p_tasks: tasks.map((task) => ({ product_note: null, ...task })),
      },
    }
  }

  async function publishApplication(
    tasks: Array<ChangeApplicationTaskInput & { assignee_id: string }>,
    suffix?: string,
  ): Promise<PublishedFixture> {
    const fixture = publishPayload(tasks, suffix)
    const published = await leader.rpc('publish_change_application', fixture.payload)
    expect(published.error).toBeNull()
    expect(typeof published.data).toBe('string')
    const applicationId = published.data as string
    createdApplicationIds.push(applicationId)

    const action = await leader
      .from('change_action_items')
      .select('id')
      .eq('change_application_id', applicationId)
      .single()
    expect(action.error).toBeNull()
    const taskRows = await leader
      .from('product_change_tasks')
      .select('id,product_id,assignee_id,status')
      .eq('action_item_id', action.data!.id)
      .order('product_id')
    expect(taskRows.error).toBeNull()
    expect(taskRows.data).toHaveLength(tasks.length)
    createdTaskIds.push(...taskRows.data!.map((task) => task.id))

    return {
      applicationId,
      actionId: action.data!.id,
      changeNumber: fixture.changeNumber,
      title: fixture.title,
      payload: fixture.payload,
      tasks: taskRows.data!,
    }
  }

  async function saveDraftApplication(
    tasks: ChangeApplicationTaskInput[],
    suffix?: string,
  ): Promise<PublishedFixture> {
    const fixture = publishPayload(tasks, suffix)
    const saved = await leader.rpc('save_change_application_draft', fixture.payload)
    expect(saved.error).toBeNull()
    expect(typeof saved.data).toBe('string')
    const applicationId = saved.data as string
    createdApplicationIds.push(applicationId)

    const action = await leader
      .from('change_action_items')
      .select('id')
      .eq('change_application_id', applicationId)
      .single()
    expect(action.error).toBeNull()
    const taskRows = await leader
      .from('product_change_tasks')
      .select('id,product_id,assignee_id,status')
      .eq('action_item_id', action.data!.id)
      .order('product_id')
    expect(taskRows.error).toBeNull()
    expect(taskRows.data).toHaveLength(tasks.length)
    createdTaskIds.push(...taskRows.data!.map((task) => task.id))

    return {
      applicationId,
      actionId: action.data!.id,
      changeNumber: fixture.changeNumber,
      title: fixture.title,
      payload: fixture.payload,
      tasks: taskRows.data!,
    }
  }

  async function expectApplicationHidden(client: Client, fixture: PublishedFixture) {
    const [application, action, tasks] = await Promise.all([
      client.from('change_applications').select('id').eq('id', fixture.applicationId),
      client.from('change_action_items').select('id').eq('id', fixture.actionId),
      client.from('product_change_tasks').select('id').in('id', fixture.tasks.map((task) => task.id)),
    ])
    for (const result of [application, action, tasks]) {
      expect(result.error).toBeNull()
      expect(result.data).toEqual([])
    }
  }

  async function applicationSnapshot(applicationId: string) {
    const result = await leader
      .from('change_applications')
      .select('updated_at,archived_at,final_completed_at,final_completion_note')
      .eq('id', applicationId)
      .single()
    expect(result.error).toBeNull()
    return result.data!
  }

  async function summaryFor(client: Client, applicationId: string) {
    const result = await client.rpc('get_change_bootstrap_v3')
    expect(result.error).toBeNull()
    const summaries = result.data?.data?.application_summaries ?? []
    return summaries.find((summary: { change_application_id: string }) =>
      summary.change_application_id === applicationId,
    )
  }

  async function historyFor(client: Client, query: string, overrides: Record<string, unknown> = {}) {
    const result = await client.rpc('list_change_application_history_v1', historyArgs({
      p_query: query,
      ...overrides,
    }))
    expect(result.error).toBeNull()
    return result.data?.rows ?? []
  }

  beforeAll(async () => {
    if (!url || !anonKey) throw new Error('Set local SUPABASE_URL and SUPABASE_ANON_KEY')
    memberAId = requiredEnv('RLS_MEMBER_A_USER_ID')
    memberBId = requiredEnv('RLS_MEMBER_B_USER_ID')
    inactiveMemberId = requiredEnv('RLS_INACTIVE_MEMBER_USER_ID')

    admin = createClient(url, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), clientOptions)
    anonymous = createClient(url, anonKey, clientOptions)
    leader = createClient(url, anonKey, clientOptions)
    leaderB = createClient(url, anonKey, clientOptions)
    memberA = createClient(url, anonKey, clientOptions)
    memberB = createClient(url, anonKey, clientOptions)

    const signIns = await Promise.all([
      leader.auth.signInWithPassword({
        email: requiredEnv('RLS_LEADER_EMAIL'),
        password: requiredEnv('RLS_LEADER_PASSWORD'),
      }),
      leaderB.auth.signInWithPassword({
        email: requiredEnv('RLS_LEADER_B_EMAIL'),
        password: requiredEnv('RLS_LEADER_B_PASSWORD'),
      }),
      memberA.auth.signInWithPassword({
        email: requiredEnv('RLS_MEMBER_A_EMAIL'),
        password: requiredEnv('RLS_MEMBER_A_PASSWORD'),
      }),
      memberB.auth.signInWithPassword({
        email: requiredEnv('RLS_MEMBER_B_EMAIL'),
        password: requiredEnv('RLS_MEMBER_B_PASSWORD'),
      }),
    ])
    for (const signIn of signIns) expect(signIn.error).toBeNull()

    ;[productAId, productBId] = await Promise.all([
      createProduct('A'),
      createProduct('B'),
    ])
  }, 30_000)

  afterAll(async () => {
    if (!admin) return
    if (createdTaskIds.length > 0) {
      const taskActivityCleanup = await admin
        .from('activity_logs')
        .delete()
        .eq('entity_type', 'product_change_task')
        .in('entity_id', createdTaskIds)
      expect(taskActivityCleanup.error).toBeNull()
    }
    if (createdApplicationIds.length > 0) {
      const applicationActivityCleanup = await admin
        .from('activity_logs')
        .delete()
        .eq('entity_type', 'change_application')
        .in('entity_id', createdApplicationIds)
      expect(applicationActivityCleanup.error).toBeNull()
      const applicationCleanup = await admin
        .from('change_applications')
        .delete()
        .in('id', createdApplicationIds)
      expect(applicationCleanup.error).toBeNull()
    }
    if (createdProductIds.length > 0) {
      const productCleanup = await admin.from('products').delete().in('id', createdProductIds)
      expect(productCleanup.error).toBeNull()
    }
  }, 30_000)

  it('revokes sensitive SECURITY DEFINER RPC execution from PUBLIC and anon', async () => {
    const unknownId = crypto.randomUUID()
    const anonymousCalls = [
      anonymous.rpc('publish_change_application', publishPayload([
        { product_id: productAId, assignee_id: memberAId },
      ], 'ANON').payload),
      anonymous.rpc('complete_product_change_task', {
        p_task_id: unknownId,
        p_completion_note: null,
        p_proxy_reason: null,
      }),
      anonymous.rpc('mark_product_change_task_not_applicable', {
        p_task_id: unknownId,
        p_reason: 'anonymous attempt',
        p_proxy_reason: null,
      }),
      anonymous.rpc('reopen_product_change_task', {
        p_task_id: unknownId,
        p_reason: 'anonymous attempt',
      }),
      anonymous.rpc('remove_product_from_change_scope', {
        p_task_id: unknownId,
        p_reason: 'anonymous attempt',
      }),
      anonymous.rpc('complete_change_application', {
        p_change_application_id: unknownId,
        p_expected_updated_at: new Date().toISOString(),
        p_note: null,
      }),
      anonymous.rpc('undo_change_application_completion', {
        p_change_application_id: unknownId,
        p_expected_updated_at: new Date().toISOString(),
        p_reason: 'anonymous attempt',
        p_reopen_tasks: [{ task_id: unknownId, assignee_id: memberAId }],
      }),
      anonymous.rpc('reassign_product_change_tasks', {
        p_task_ids: [unknownId],
        p_assignee_id: memberAId,
        p_reason: 'anonymous attempt',
      }),
      anonymous.rpc('get_change_bootstrap_v3'),
      anonymous.rpc('list_change_application_history_v1', historyArgs()),
    ]

    const results = await Promise.all(anonymousCalls)
    for (const result of results) {
      expect(result.error?.code).toBe('42501')
    }
  }, 30_000)

  it('allows only an active leader to publish and requires an active assignee for every product', async () => {
    const memberAttempt = publishPayload([
      { product_id: productAId, assignee_id: memberAId },
    ], 'MEMBER-AUTHOR')
    expectContractError(
      await memberA.rpc('publish_change_application', memberAttempt.payload),
      'SQA_ACTIVE_LEADER_REQUIRED',
    )

    const unassigned = publishPayload([
      { product_id: productAId, assignee_id: null },
    ], 'UNASSIGNED')
    expectContractError(
      await leader.rpc('publish_change_application', unassigned.payload),
      'SQA_CHANGE_ACTIVE_ASSIGNEE_REQUIRED',
    )

    const inactive = publishPayload([
      { product_id: productAId, assignee_id: inactiveMemberId },
    ], 'INACTIVE')
    expectContractError(
      await leader.rpc('publish_change_application', inactive.payload),
      'SQA_CHANGE_ACTIVE_ASSIGNEE_REQUIRED',
    )
  })

  it('blocks authenticated direct DML on every change-application table', async () => {
    const fixture = await publishApplication([
      { product_id: productAId, assignee_id: memberAId },
    ], 'DIRECT-DML')
    const task = fixture.tasks[0]

    const directWrites = await Promise.all([
      leader
        .from('change_applications')
        .update({ title: 'Direct application update must fail' })
        .eq('id', fixture.applicationId),
      leader
        .from('change_action_items')
        .update({ content: 'Direct action update must fail' })
        .eq('id', fixture.actionId),
      memberA
        .from('product_change_tasks')
        .update({ status: 'completed' })
        .eq('id', task.id),
    ])
    for (const result of directWrites) expect(result.error).not.toBeNull()

    const [application, action, retainedTask] = await Promise.all([
      leader.from('change_applications').select('title').eq('id', fixture.applicationId).single(),
      leader.from('change_action_items').select('content').eq('id', fixture.actionId).single(),
      leader.from('product_change_tasks').select('status').eq('id', task.id).single(),
    ])
    expect(application.error).toBeNull()
    expect(action.error).toBeNull()
    expect(retainedTask.error).toBeNull()
    expect(application.data?.title).toBe(fixture.title)
    expect(action.data?.content).toBe(fixture.payload.p_action_content)
    expect(retainedTask.data?.status).toBe('pending')
  }, 30_000)

  it('rejects unsafe source URLs atomically', async () => {
    const fixture = publishPayload([
      { product_id: productAId, assignee_id: memberAId },
    ], 'UNSAFE-SOURCE-URL')
    const rejected = await leader.rpc('publish_change_application', {
      ...fixture.payload,
      p_source_url: 'javascript:alert(document.domain)',
    })
    expectContractError(rejected, 'SQA_CHANGE_SOURCE_URL_INVALID')

    const retained = await leader
      .from('change_applications')
      .select('id')
      .eq('change_number', fixture.changeNumber)
    expect(retained.error).toBeNull()
    expect(retained.data).toEqual([])
  })

  it('rejects stale draft saves without overwriting the winning title or product scope', async () => {
    const fixture = await saveDraftApplication([
      { product_id: productAId, assignee_id: memberAId, product_note: 'initial scope' },
    ], 'STALE-OCC')
    const initial = await applicationSnapshot(fixture.applicationId)
    const winnerTitle = `OCC winner ${nonce}`

    const winner = await leader.rpc('save_change_application_draft', {
      ...fixture.payload,
      p_change_application_id: fixture.applicationId,
      p_expected_updated_at: initial.updated_at,
      p_title: winnerTitle,
      p_tasks: [{
        product_id: productAId,
        assignee_id: memberAId,
        product_note: 'winning scope',
      }],
    })
    expect(winner.error).toBeNull()

    const stale = await leaderB.rpc('save_change_application_draft', {
      ...fixture.payload,
      p_change_application_id: fixture.applicationId,
      p_expected_updated_at: initial.updated_at,
      p_title: `Stale loser ${nonce}`,
      p_tasks: [{
        product_id: productBId,
        assignee_id: memberBId,
        product_note: 'stale scope',
      }],
    })
    expectContractError(stale, 'SQA_CHANGE_APPLICATION_CONFLICT')

    const [application, tasks] = await Promise.all([
      leader
        .from('change_applications')
        .select('title')
        .eq('id', fixture.applicationId)
        .single(),
      leader
        .from('product_change_tasks')
        .select('product_id,assignee_id,product_note,status')
        .eq('action_item_id', fixture.actionId),
    ])
    expect(application.error).toBeNull()
    expect(tasks.error).toBeNull()
    expect(application.data?.title).toBe(winnerTitle)
    expect(tasks.data).toEqual([expect.objectContaining({
      product_id: productAId,
      assignee_id: memberAId,
      product_note: 'winning scope',
      status: 'pending',
    })])
  }, 30_000)

  it('keeps common content locked after the first product decision, including after reopen', async () => {
    const fixture = await publishApplication([
      { product_id: productAId, assignee_id: memberAId },
    ], 'CONTENT-LOCK')
    const task = fixture.tasks[0]

    expect((await memberA.rpc('complete_product_change_task', {
      p_task_id: task.id,
      p_completion_note: 'first processing locks common content',
      p_proxy_reason: null,
    })).error).toBeNull()

    const locked = await applicationSnapshot(fixture.applicationId)
    expectContractError(await leader.rpc('publish_change_application', {
      ...fixture.payload,
      p_change_application_id: fixture.applicationId,
      p_expected_updated_at: locked.updated_at,
      p_title: 'Processed content must not change',
      p_tasks: [{ product_id: productAId, assignee_id: memberAId, product_note: 'locked edit' }],
    }), 'SQA_CHANGE_CONTENT_LOCKED')

    expect((await memberA.rpc('reopen_product_change_task', {
      p_task_id: task.id,
      p_reason: 'verify that reopen does not unlock common content',
    })).error).toBeNull()
    const reopened = await applicationSnapshot(fixture.applicationId)
    expectContractError(await leader.rpc('publish_change_application', {
      ...fixture.payload,
      p_change_application_id: fixture.applicationId,
      p_expected_updated_at: reopened.updated_at,
      p_title: 'Reopened content must still not change',
      p_tasks: [{ product_id: productAId, assignee_id: memberAId, product_note: 'still locked' }],
    }), 'SQA_CHANGE_CONTENT_LOCKED')

    const retained = await leader
      .from('change_applications')
      .select('title,content_locked_at')
      .eq('id', fixture.applicationId)
      .single()
    expect(retained.error).toBeNull()
    expect(retained.data?.title).toBe(fixture.title)
    expect(retained.data?.content_locked_at).toBeTruthy()
  }, 30_000)

  it('hides drafts and cancelled unpublished drafts from every non-leader', async () => {
    const fixture = await saveDraftApplication([
      { product_id: productAId, assignee_id: memberAId },
    ], 'PRIVATE-DRAFT')

    await expectApplicationHidden(memberA, fixture)
    await expectApplicationHidden(memberB, fixture)

    const cancelled = await leader.rpc('cancel_change_application', {
      p_change_application_id: fixture.applicationId,
      p_reason: 'cancel unpublished draft privacy fixture',
    })
    expect(cancelled.error).toBeNull()

    await expectApplicationHidden(memberA, fixture)
    await expectApplicationHidden(memberB, fixture)
  }, 30_000)

  it('never implicitly reactivates a manually cancelled draft task', async () => {
    const fixture = await saveDraftApplication([
      { product_id: productAId, assignee_id: memberAId, product_note: 'cancelled scope' },
    ], 'MANUAL-CANCEL')
    const task = fixture.tasks[0]

    expect((await leader.rpc('cancel_product_change_task', {
      p_task_id: task.id,
      p_reason: 'manual cancellation must require an explicit recovery path',
    })).error).toBeNull()
    const cancelled = await applicationSnapshot(fixture.applicationId)

    expectContractError(await leader.rpc('save_change_application_draft', {
      ...fixture.payload,
      p_change_application_id: fixture.applicationId,
      p_expected_updated_at: cancelled.updated_at,
    }), 'SQA_CHANGE_MANUAL_CANCELLED_TASKS')
    expectContractError(await leader.rpc('save_change_application_draft', {
      ...fixture.payload,
      p_change_application_id: fixture.applicationId,
      p_expected_updated_at: cancelled.updated_at,
      p_tasks: [{ product_id: productBId, assignee_id: memberBId, product_note: 'omission bypass' }],
    }), 'SQA_CHANGE_MANUAL_CANCELLED_TASKS')

    const retained = await leader
      .from('product_change_tasks')
      .select('status,cancel_kind,resolution_reason')
      .eq('id', task.id)
      .single()
    expect(retained.error).toBeNull()
    expect(retained.data).toMatchObject({
      status: 'cancelled',
      cancel_kind: 'manual',
      resolution_reason: 'manual cancellation must require an explicit recovery path',
    })
  }, 30_000)

  it('allows only the new assignee to process work after task reassignment and product-owner transfer', async () => {
    const reassignedFixture = await publishApplication([
      { product_id: productAId, assignee_id: memberAId },
    ], 'PROCESS-AFTER-REASSIGN')
    const reassignedTask = reassignedFixture.tasks[0]
    expect((await leader.rpc('reassign_product_change_tasks', {
      p_task_ids: [reassignedTask.id],
      p_assignee_id: memberBId,
      p_reason: 'member B takes the pending task',
    })).error).toBeNull()

    expectContractError(await memberA.rpc('complete_product_change_task', {
      p_task_id: reassignedTask.id,
      p_completion_note: 'former assignee attempt',
      p_proxy_reason: null,
    }), 'SQA_CHANGE_ASSIGNEE_REQUIRED')
    expect((await memberB.rpc('complete_product_change_task', {
      p_task_id: reassignedTask.id,
      p_completion_note: 'new assignee completed reassigned work',
      p_proxy_reason: null,
    })).error).toBeNull()

    const transferProductId = await createProduct('TRANSFER')
    const transferredFixture = await publishApplication([
      { product_id: transferProductId, assignee_id: memberAId },
    ], 'PROCESS-AFTER-PRODUCT-TRANSFER')
    const transferredTask = transferredFixture.tasks[0]
    const transferred = await leader.rpc('assign_product_and_transfer_change_tasks', {
      p_product_id: transferProductId,
      p_user_id: memberBId,
      p_transfer_pending: true,
      p_reason: 'member B becomes product owner and takes pending work',
    })
    expect(transferred.error).toBeNull()
    expect(Number(transferred.data)).toBe(1)

    expectContractError(await memberA.rpc('complete_product_change_task', {
      p_task_id: transferredTask.id,
      p_completion_note: 'former product owner attempt',
      p_proxy_reason: null,
    }), 'SQA_CHANGE_ASSIGNEE_REQUIRED')
    expect((await memberB.rpc('complete_product_change_task', {
      p_task_id: transferredTask.id,
      p_completion_note: 'new product owner completed transferred work',
      p_proxy_reason: null,
    })).error).toBeNull()

    const processed = await leader
      .from('product_change_tasks')
      .select('id,status,assignee_id,completed_by')
      .in('id', [reassignedTask.id, transferredTask.id])
    expect(processed.error).toBeNull()
    expect(processed.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: reassignedTask.id,
        status: 'completed',
        assignee_id: memberBId,
        completed_by: memberBId,
      }),
      expect.objectContaining({
        id: transferredTask.id,
        status: 'completed',
        assignee_id: memberBId,
        completed_by: memberBId,
      }),
    ]))
  }, 30_000)

  it('lets only each designated assignee complete, mark not applicable, and reopen while denying leader proxy handling', async () => {
    const fixture = await publishApplication([
      { product_id: productAId, assignee_id: memberAId },
      { product_id: productBId, assignee_id: memberBId },
    ], 'ASSIGNEE-BOUNDARY')
    const taskA = fixture.tasks.find((task) => task.product_id === productAId)!
    const taskB = fixture.tasks.find((task) => task.product_id === productBId)!

    expectContractError(await memberB.rpc('complete_product_change_task', {
      p_task_id: taskA.id,
      p_completion_note: 'foreign completion',
      p_proxy_reason: null,
    }), 'SQA_CHANGE_ASSIGNEE_REQUIRED')
    expectContractError(await leader.rpc('complete_product_change_task', {
      p_task_id: taskA.id,
      p_completion_note: 'leader direct completion',
      p_proxy_reason: null,
    }), 'SQA_CHANGE_ASSIGNEE_REQUIRED')
    expectContractError(await leader.rpc('complete_product_change_task', {
      p_task_id: taskA.id,
      p_completion_note: 'leader proxy completion',
      p_proxy_reason: 'proxy requested by leader',
    }), 'SQA_CHANGE_PROXY_COMPLETION_FORBIDDEN')

    const completedA = await memberA.rpc('complete_product_change_task', {
      p_task_id: taskA.id,
      p_completion_note: 'member A evidence',
      p_proxy_reason: null,
    })
    expect(completedA.error).toBeNull()

    expectContractError(await memberA.rpc('mark_product_change_task_not_applicable', {
      p_task_id: taskB.id,
      p_reason: 'foreign not-applicable attempt',
      p_proxy_reason: null,
    }), 'SQA_CHANGE_ASSIGNEE_REQUIRED')
    const notApplicableB = await memberB.rpc('mark_product_change_task_not_applicable', {
      p_task_id: taskB.id,
      p_reason: 'product B is not affected',
      p_proxy_reason: null,
    })
    expect(notApplicableB.error).toBeNull()

    const waitingSnapshot = await applicationSnapshot(fixture.applicationId)
    expect(waitingSnapshot).toMatchObject({
      archived_at: null,
      final_completed_at: null,
    })
    expect(await summaryFor(leader, fixture.applicationId)).toMatchObject({
      workflow_status: 'final_review_ready',
      total_count: 2,
      processed_count: 2,
      can_finalize: true,
    })

    expectContractError(await memberB.rpc('reopen_product_change_task', {
      p_task_id: taskA.id,
      p_reason: 'foreign reopen attempt',
    }), 'SQA_CHANGE_ASSIGNEE_REQUIRED')
    expectContractError(await leader.rpc('reopen_product_change_task', {
      p_task_id: taskB.id,
      p_reason: 'leader reopen attempt',
    }), 'SQA_CHANGE_ASSIGNEE_REQUIRED')
    const reopenedB = await memberB.rpc('reopen_product_change_task', {
      p_task_id: taskB.id,
      p_reason: 'member B correction',
    })
    expect(reopenedB.error).toBeNull()
    const resolvedAgain = await memberB.rpc('mark_product_change_task_not_applicable', {
      p_task_id: taskB.id,
      p_reason: 'product B remains not affected',
      p_proxy_reason: null,
    })
    expect(resolvedAgain.error).toBeNull()
  }, 30_000)

  it('counts scope removal as processed, requires an exception note, and records explicit leader final completion', async () => {
    const fixture = await publishApplication([
      { product_id: productAId, assignee_id: memberAId },
      { product_id: productBId, assignee_id: memberBId },
    ], 'SCOPE-REMOVED')
    const taskA = fixture.tasks.find((task) => task.product_id === productAId)!
    const taskB = fixture.tasks.find((task) => task.product_id === productBId)!

    expect((await memberA.rpc('complete_product_change_task', {
      p_task_id: taskA.id,
      p_completion_note: 'scope fixture completion',
      p_proxy_reason: null,
    })).error).toBeNull()
    expect((await leader.rpc('remove_product_from_change_scope', {
      p_task_id: taskB.id,
      p_reason: 'product B was removed from this change scope',
    })).error).toBeNull()

    expect(await summaryFor(leader, fixture.applicationId)).toMatchObject({
      workflow_status: 'final_review_ready',
      total_count: 2,
      completed_count: 1,
      scope_removed_count: 1,
      processed_count: 2,
      percent: 100,
      can_finalize: true,
    })

    const beforeFinal = await applicationSnapshot(fixture.applicationId)
    expectContractError(await leader.rpc('complete_change_application', {
      p_change_application_id: fixture.applicationId,
      p_expected_updated_at: beforeFinal.updated_at,
      p_note: '   ',
    }), 'SQA_CHANGE_FINAL_NOTE_REQUIRED')
    expectContractError(await memberA.rpc('complete_change_application', {
      p_change_application_id: fixture.applicationId,
      p_expected_updated_at: beforeFinal.updated_at,
      p_note: 'member must not finalize',
    }), 'SQA_ACTIVE_LEADER_REQUIRED')

    const finalized = await leader.rpc('complete_change_application', {
      p_change_application_id: fixture.applicationId,
      p_expected_updated_at: beforeFinal.updated_at,
      p_note: 'Reviewed the product B scope exception',
    })
    expect(finalized.error).toBeNull()
    const completedApplication = await applicationSnapshot(fixture.applicationId)
    expect(completedApplication.archived_at).toBeTruthy()
    expect(completedApplication.final_completed_at).toBeTruthy()
    expect(completedApplication.final_completion_note).toBe('Reviewed the product B scope exception')

    const activity = await leader
      .from('activity_logs')
      .select('metadata')
      .eq('entity_type', 'change_application')
      .eq('entity_id', fixture.applicationId)
      .eq('action', 'final_completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(activity.error).toBeNull()
    expect(activity.data?.metadata).toMatchObject({
      total_count: 2,
      completed_count: 1,
      not_applicable_count: 0,
      scope_removed_count: 1,
    })

    const history = await historyFor(leader, fixture.changeNumber)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      id: fixture.applicationId,
      history_result: 'completed',
      application_summary: {
        total_count: 2,
        processed_count: 2,
        scope_removed_count: 1,
        percent: 100,
      },
    })
  }, 30_000)

  it('excludes application-cancelled pending tasks from workflow aggregates', async () => {
    const fixture = await publishApplication([
      { product_id: productAId, assignee_id: memberAId },
      { product_id: productBId, assignee_id: memberBId },
    ], 'APPLICATION-CANCELLED')
    const taskA = fixture.tasks.find((task) => task.product_id === productAId)!

    expect((await memberA.rpc('complete_product_change_task', {
      p_task_id: taskA.id,
      p_completion_note: 'completed before cancellation',
      p_proxy_reason: null,
    })).error).toBeNull()
    expect((await leader.rpc('cancel_change_application', {
      p_change_application_id: fixture.applicationId,
      p_reason: 'entire common change was withdrawn',
    })).error).toBeNull()

    const history = await historyFor(leader, fixture.changeNumber)
    expect(history).toHaveLength(1)
    expect(history[0].application_summary).toMatchObject({
      workflow_status: 'cancelled',
      total_count: 1,
      completed_count: 1,
      processed_count: 1,
      percent: 100,
    })
    expect(history[0].product_tasks).toHaveLength(2)
    expect(history[0].product_tasks).toContainEqual(expect.objectContaining({
      status: 'cancelled',
      cancel_kind: 'application_cancelled',
    }))
  }, 30_000)

  it('requires selected products and active new assignees when a leader undoes final completion', async () => {
    const fixture = await publishApplication([
      { product_id: productAId, assignee_id: memberAId },
      { product_id: productBId, assignee_id: memberBId },
    ], 'FINAL-UNDO')
    const taskA = fixture.tasks.find((task) => task.product_id === productAId)!
    const taskB = fixture.tasks.find((task) => task.product_id === productBId)!

    expect((await memberA.rpc('complete_product_change_task', {
      p_task_id: taskA.id,
      p_completion_note: 'member A complete',
      p_proxy_reason: null,
    })).error).toBeNull()
    expect((await memberB.rpc('mark_product_change_task_not_applicable', {
      p_task_id: taskB.id,
      p_reason: 'member B exception',
      p_proxy_reason: null,
    })).error).toBeNull()
    const ready = await applicationSnapshot(fixture.applicationId)
    expect((await leader.rpc('complete_change_application', {
      p_change_application_id: fixture.applicationId,
      p_expected_updated_at: ready.updated_at,
      p_note: 'Reviewed not-applicable exception',
    })).error).toBeNull()
    const finalized = await applicationSnapshot(fixture.applicationId)

    const validSelection = [{ task_id: taskB.id, assignee_id: memberAId }]
    expectContractError(await memberA.rpc('undo_change_application_completion', {
      p_change_application_id: fixture.applicationId,
      p_expected_updated_at: finalized.updated_at,
      p_reason: 'member undo attempt',
      p_reopen_tasks: validSelection,
    }), 'SQA_ACTIVE_LEADER_REQUIRED')
    expectContractError(await leader.rpc('undo_change_application_completion', {
      p_change_application_id: fixture.applicationId,
      p_expected_updated_at: finalized.updated_at,
      p_reason: '   ',
      p_reopen_tasks: validSelection,
    }), 'SQA_CHANGE_UNDO_REASON_REQUIRED')
    expectContractError(await leader.rpc('undo_change_application_completion', {
      p_change_application_id: fixture.applicationId,
      p_expected_updated_at: finalized.updated_at,
      p_reason: 'selection is required',
      p_reopen_tasks: [],
    }), 'SQA_CHANGE_REOPEN_TASKS_INVALID')
    expectContractError(await leader.rpc('undo_change_application_completion', {
      p_change_application_id: fixture.applicationId,
      p_expected_updated_at: finalized.updated_at,
      p_reason: 'assignee is required',
      p_reopen_tasks: [{ task_id: taskB.id, assignee_id: null }],
    }), 'SQA_CHANGE_REOPEN_TASKS_INVALID')
    expectContractError(await leader.rpc('undo_change_application_completion', {
      p_change_application_id: fixture.applicationId,
      p_expected_updated_at: finalized.updated_at,
      p_reason: 'inactive assignee is forbidden',
      p_reopen_tasks: [{ task_id: taskB.id, assignee_id: inactiveMemberId }],
    }), 'SQA_CHANGE_ACTIVE_ASSIGNEE_REQUIRED')

    const undone = await leader.rpc('undo_change_application_completion', {
      p_change_application_id: fixture.applicationId,
      p_expected_updated_at: finalized.updated_at,
      p_reason: 'product B requires another review',
      p_reopen_tasks: validSelection,
    })
    expect(undone.error).toBeNull()

    const activeAgain = await applicationSnapshot(fixture.applicationId)
    expect(activeAgain).toMatchObject({ archived_at: null, final_completed_at: null })
    const tasks = await leader
      .from('product_change_tasks')
      .select('id,status,assignee_id,completed_by,reopen_reason')
      .in('id', [taskA.id, taskB.id])
    expect(tasks.error).toBeNull()
    expect(tasks.data).toContainEqual(expect.objectContaining({
      id: taskA.id,
      status: 'completed',
      completed_by: memberAId,
    }))
    expect(tasks.data).toContainEqual(expect.objectContaining({
      id: taskB.id,
      status: 'pending',
      assignee_id: memberAId,
      completed_by: null,
      reopen_reason: 'product B requires another review',
    }))
  }, 30_000)

  it('rejects null and inactive reassignment targets and accepts one active replacement assignee', async () => {
    const fixture = await publishApplication([
      { product_id: productAId, assignee_id: memberAId },
    ], 'REASSIGNMENT')
    const task = fixture.tasks[0]

    expectContractError(await leader.rpc('reassign_product_change_tasks', {
      p_task_ids: [task.id],
      p_assignee_id: null,
      p_reason: 'null assignee must be rejected',
    }), 'SQA_CHANGE_ACTIVE_ASSIGNEE_REQUIRED')
    expectContractError(await leader.rpc('reassign_product_change_tasks', {
      p_task_ids: [task.id],
      p_assignee_id: inactiveMemberId,
      p_reason: 'inactive assignee must be rejected',
    }), 'SQA_CHANGE_ACTIVE_ASSIGNEE_REQUIRED')

    const reassigned = await leader.rpc('reassign_product_change_tasks', {
      p_task_ids: [task.id],
      p_assignee_id: memberBId,
      p_reason: 'active member B takes responsibility',
    })
    expect(reassigned.error).toBeNull()
    const updated = await leader
      .from('product_change_tasks')
      .select('assignee_id,assignee_name,status')
      .eq('id', task.id)
      .single()
    expect(updated.error).toBeNull()
    expect(updated.data).toMatchObject({ assignee_id: memberBId, status: 'pending' })
    expect(updated.data?.assignee_name).toBeTruthy()
  }, 30_000)

  it('keeps completed history searchable while limiting members to their own durable product history', async () => {
    const fixture = await publishApplication([
      { product_id: productAId, assignee_id: memberAId },
    ], 'HISTORY-SCOPE')
    const task = fixture.tasks[0]

    expect((await memberA.rpc('complete_product_change_task', {
      p_task_id: task.id,
      p_completion_note: 'history search evidence',
      p_proxy_reason: null,
    })).error).toBeNull()
    const ready = await applicationSnapshot(fixture.applicationId)
    expect((await leader.rpc('complete_change_application', {
      p_change_application_id: fixture.applicationId,
      p_expected_updated_at: ready.updated_at,
      p_note: null,
    })).error).toBeNull()

    const leaderRows = await historyFor(leader, fixture.changeNumber)
    expect(leaderRows).toHaveLength(1)
    expect(leaderRows[0]).toMatchObject({
      id: fixture.applicationId,
      title: fixture.title,
      history_result: 'completed',
    })
    expect(leaderRows[0].product_tasks).toHaveLength(1)

    const ownerRows = await historyFor(memberA, fixture.changeNumber)
    expect(ownerRows).toHaveLength(1)
    expect(ownerRows[0].id).toBe(fixture.applicationId)
    expect(ownerRows[0].product_tasks).toEqual([
      expect.objectContaining({ id: task.id, completed_by: memberAId }),
    ])

    expect(await historyFor(memberB, fixture.changeNumber)).toEqual([])
    expect(await historyFor(memberB, fixture.changeNumber, {
      p_assignee_id: memberAId,
    })).toEqual([])
  }, 30_000)

  it('keeps a former assignee completion history visible after activity logs are deleted', async () => {
    const historyProductId = await createProduct('DURABLE-HISTORY')
    const fixture = await publishApplication([
      { product_id: historyProductId, assignee_id: memberAId },
    ], 'DURABLE-ASSIGNEE-HISTORY')
    const task = fixture.tasks[0]

    expect((await leader.rpc('reassign_product_change_tasks', {
      p_task_ids: [task.id],
      p_assignee_id: memberBId,
      p_reason: 'member B takes ownership before completion',
    })).error).toBeNull()
    expect((await memberB.rpc('complete_product_change_task', {
      p_task_id: task.id,
      p_completion_note: 'completed by the successor',
      p_proxy_reason: null,
    })).error).toBeNull()
    const ready = await applicationSnapshot(fixture.applicationId)
    expect((await leader.rpc('complete_change_application', {
      p_change_application_id: fixture.applicationId,
      p_expected_updated_at: ready.updated_at,
      p_note: null,
    })).error).toBeNull()

    const deletedActivity = await admin
      .from('activity_logs')
      .delete()
      .in('entity_id', [fixture.applicationId, task.id])
      .select('id')
    expect(deletedActivity.error).toBeNull()
    expect(deletedActivity.data!.length).toBeGreaterThan(0)

    const formerOwnerRows = await historyFor(memberA, fixture.changeNumber, {
      p_assignee_id: memberAId,
    })
    expect(formerOwnerRows).toHaveLength(1)
    expect(formerOwnerRows[0].id).toBe(fixture.applicationId)
    expect(formerOwnerRows[0].product_tasks).toEqual([
      expect.objectContaining({
        id: task.id,
        assignee_id: memberBId,
        completed_by: memberBId,
      }),
    ])
  }, 30_000)

  it('repairs completed and not-applicable work when the current assignee becomes inactive', async () => {
    const completedProductId = await createProduct('INACTIVE-COMPLETED')
    const notApplicableProductId = await createProduct('INACTIVE-NOT-APPLICABLE')
    const fixture = await publishApplication([
      { product_id: completedProductId, assignee_id: memberAId },
      { product_id: notApplicableProductId, assignee_id: memberAId },
    ], 'INACTIVE-TERMINAL-RECOVERY')
    const completedTask = fixture.tasks.find((task) => task.product_id === completedProductId)!
    const notApplicableTask = fixture.tasks.find((task) => task.product_id === notApplicableProductId)!

    expect((await memberA.rpc('complete_product_change_task', {
      p_task_id: completedTask.id,
      p_completion_note: 'preserve this completion evidence',
      p_proxy_reason: null,
    })).error).toBeNull()
    expect((await memberA.rpc('mark_product_change_task_not_applicable', {
      p_task_id: notApplicableTask.id,
      p_reason: 'preserve this not-applicable reason',
      p_proxy_reason: null,
    })).error).toBeNull()

    const beforeRecovery = await leader
      .from('product_change_tasks')
      .select('id,status,assignee_id,completion_note,resolution_reason,completed_by,completed_at')
      .in('id', [completedTask.id, notApplicableTask.id])
    expect(beforeRecovery.error).toBeNull()
    const beforeById = new Map(beforeRecovery.data!.map((task) => [task.id, task]))

    let memberADeactivated = false
    try {
      const deactivated = await admin
        .from('profiles')
        .update({ is_active: false })
        .eq('id', memberAId)
        .select('id,is_active')
        .single()
      expect(deactivated.error).toBeNull()
      expect(deactivated.data?.is_active).toBe(false)
      memberADeactivated = true

      expect(await summaryFor(leader, fixture.applicationId)).toMatchObject({
        workflow_status: 'in_progress',
        unassigned_count: 2,
        can_finalize: false,
      })
      const blocked = await applicationSnapshot(fixture.applicationId)
      expectContractError(await leader.rpc('complete_change_application', {
        p_change_application_id: fixture.applicationId,
        p_expected_updated_at: blocked.updated_at,
        p_note: 'inactive assignee must be repaired first',
      }), 'SQA_CHANGE_ACTIVE_ASSIGNEE_REQUIRED')

      const repaired = await leader.rpc('reassign_product_change_tasks', {
        p_task_ids: [completedTask.id, notApplicableTask.id],
        p_assignee_id: memberBId,
        p_reason: 'recover terminal work from an inactive assignee',
      })
      expect(repaired.error).toBeNull()

      const afterRecovery = await leader
        .from('product_change_tasks')
        .select('id,status,assignee_id,completion_note,resolution_reason,completed_by,completed_at')
        .in('id', [completedTask.id, notApplicableTask.id])
      expect(afterRecovery.error).toBeNull()
      for (const task of afterRecovery.data!) {
        const before = beforeById.get(task.id)!
        expect(task).toMatchObject({
          status: before.status,
          assignee_id: memberBId,
          completion_note: before.completion_note,
          resolution_reason: before.resolution_reason,
          completed_by: memberAId,
          completed_at: before.completed_at,
        })
      }
      expect(await summaryFor(leader, fixture.applicationId)).toMatchObject({
        workflow_status: 'final_review_ready',
        unassigned_count: 0,
        can_finalize: true,
      })

      const recovered = await applicationSnapshot(fixture.applicationId)
      expect((await leader.rpc('complete_change_application', {
        p_change_application_id: fixture.applicationId,
        p_expected_updated_at: recovered.updated_at,
        p_note: 'reviewed the repaired not-applicable responsibility',
      })).error).toBeNull()
    } finally {
      if (memberADeactivated) {
        const restored = await admin
          .from('profiles')
          .update({ is_active: true })
          .eq('id', memberAId)
        expect(restored.error).toBeNull()
      }
    }
  }, 30_000)
})
