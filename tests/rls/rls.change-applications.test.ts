import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured, RLS_SKIP_NOTE } from './helpers'

const describeRls = isSupabaseRlsTargetConfigured() ? describe : describe.skip

describeRls(`RLS change applications (${RLS_SKIP_NOTE})`, () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''

  it('publishes atomically, limits task processing, retains history, and locks processed content', async () => {
    const memberAEmail = process.env.RLS_MEMBER_A_EMAIL
    const memberAPassword = process.env.RLS_MEMBER_A_PASSWORD
    const memberAId = process.env.RLS_MEMBER_A_USER_ID
    const memberBEmail = process.env.RLS_MEMBER_B_EMAIL
    const memberBPassword = process.env.RLS_MEMBER_B_PASSWORD
    const memberBId = process.env.RLS_MEMBER_B_USER_ID
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD
    const productId = process.env.RLS_TEST_PRODUCT_ID
    if (
      !memberAEmail || !memberAPassword || !memberAId || !memberBEmail || !memberBPassword || !memberBId
      || !leaderEmail || !leaderPassword || !productId
    ) {
      expect.fail('Set member A/B and leader credentials/ids plus the product RLS fixture')
    }

    const memberA = createClient(url, anonKey, { auth: { persistSession: false } })
    const memberB = createClient(url, anonKey, { auth: { persistSession: false } })
    const leader = createClient(url, anonKey, { auth: { persistSession: false } })
    expect((await memberA.auth.signInWithPassword({ email: memberAEmail, password: memberAPassword })).error).toBeNull()
    expect((await memberB.auth.signInWithPassword({ email: memberBEmail, password: memberBPassword })).error).toBeNull()
    expect((await leader.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })).error).toBeNull()

    const changeNumber = `RLS-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const payload = {
      p_change_application_id: null,
      p_expected_updated_at: null,
      p_change_number: changeNumber,
      p_source: 'official',
      p_title: 'RLS product change',
      p_summary: 'Atomic registration and task authorization fixture',
      p_source_url: null,
      p_effective_date: '2099-01-01',
      p_action_kind: 'product_standard',
      p_custom_kind_name: null,
      p_action_content: 'Update the controlled product standard',
      p_due_date: '2099-01-10',
      p_tasks: [{ product_id: productId, assignee_id: null, product_note: null }],
    }
    const unsafeSourceUrl = await memberA.rpc('publish_change_application', {
      ...payload,
      p_change_number: `${changeNumber}-UNSAFE-URL`,
      p_source_url: 'javascript:alert(document.domain)',
    })
    expect(unsafeSourceUrl.error?.message).toContain('source url must use http or https')

    const published = await memberA.rpc('publish_change_application', payload)
    expect(published.error).toBeNull()
    expect(typeof published.data).toBe('string')
    const applicationId = published.data as string

    const visibleToMember = await memberB
      .from('change_applications')
      .select('id,change_number,status')
      .eq('id', applicationId)
      .single()
    expect(visibleToMember.error).toBeNull()
    expect(visibleToMember.data?.status).toBe('published')

    const action = await memberA
      .from('change_action_items')
      .select('id')
      .eq('change_application_id', applicationId)
      .single()
    expect(action.error).toBeNull()
    const task = await memberA
      .from('product_change_tasks')
      .select('id,status,completed_by,completed_at')
      .eq('action_item_id', action.data!.id)
      .single()
    expect(task.error).toBeNull()
    expect(task.data?.status).toBe('pending')

    const initialAssignment = await leader.rpc('reassign_product_change_tasks', {
      p_task_ids: [task.data!.id],
      p_assignee_id: memberAId,
      p_reason: 'RLS initial responsibility assignment',
    })
    expect(initialAssignment.error).toBeNull()

    const directWrite = await memberA
      .from('product_change_tasks')
      .update({ status: 'completed' })
      .eq('id', task.data!.id)
    expect(directWrite.error).not.toBeNull()

    const foreignCompletion = await memberB.rpc('complete_product_change_task', {
      p_task_id: task.data!.id,
      p_completion_note: null,
      p_proxy_reason: null,
    })
    expect(foreignCompletion.error).not.toBeNull()

    const completion = await memberA.rpc('complete_product_change_task', {
      p_task_id: task.data!.id,
      p_completion_note: 'RLS completion evidence',
      p_proxy_reason: null,
    })
    expect(completion.error).toBeNull()

    const retained = await memberA
      .from('product_change_tasks')
      .select('id,status,completion_note,completed_by,completed_at')
      .eq('id', task.data!.id)
      .single()
    expect(retained.error).toBeNull()
    expect(retained.data).toMatchObject({
      id: task.data!.id,
      status: 'completed',
      completion_note: 'RLS completion evidence',
      completed_by: memberAId,
    })
    expect(retained.data?.completed_at).toBeTruthy()

    const lockedSnapshot = await memberA
      .from('change_applications')
      .select('updated_at,archived_at,archived_by,archive_reason,archive_origin')
      .eq('id', applicationId)
      .single()
    expect(lockedSnapshot.error).toBeNull()
    expect(lockedSnapshot.data).toMatchObject({
      archived_by: null,
      archive_origin: 'automatic',
      archive_reason: '모든 제품 적용이 완료되어 자동 보관됨',
    })
    expect(lockedSnapshot.data?.archived_at).toBeTruthy()
    const nonLeaderRestore = await memberA.rpc('restore_change_application', {
      p_change_application_id: applicationId,
      p_reason: 'RLS non-leader restore rejection',
    })
    expect(nonLeaderRestore.error).not.toBeNull()
    const lockedEdit = await memberA.rpc('publish_change_application', {
      ...payload,
      p_change_application_id: applicationId,
      p_expected_updated_at: lockedSnapshot.data!.updated_at,
      p_title: 'This edit must be rejected',
    })
    expect(lockedEdit.error?.message).toContain('locked after the first processed task')

    const reopened = await memberA.rpc('reopen_product_change_task', {
      p_task_id: task.data!.id,
      p_reason: 'RLS reopen verification',
    })
    expect(reopened.error).toBeNull()
    const pendingAgain = await memberA
      .from('product_change_tasks')
      .select('id,status,completed_by,completed_at,reopen_reason')
      .eq('id', task.data!.id)
      .single()
    expect(pendingAgain.error).toBeNull()
    expect(pendingAgain.data).toMatchObject({
      id: task.data!.id,
      status: 'pending',
      completed_by: null,
      completed_at: null,
      reopen_reason: 'RLS reopen verification',
    })
    const automaticallyRestored = await memberA
      .from('change_applications')
      .select('archived_at,archived_by,archive_reason,archive_origin')
      .eq('id', applicationId)
      .single()
    expect(automaticallyRestored.error).toBeNull()
    expect(automaticallyRestored.data).toEqual({
      archived_at: null,
      archived_by: null,
      archive_reason: null,
      archive_origin: null,
    })

    const reopenedSnapshot = await memberA
      .from('change_applications')
      .select('updated_at')
      .eq('id', applicationId)
      .single()
    expect(reopenedSnapshot.error).toBeNull()
    const stillLockedAfterReopen = await memberA.rpc('publish_change_application', {
      ...payload,
      p_change_application_id: applicationId,
      p_expected_updated_at: reopenedSnapshot.data!.updated_at,
      p_title: 'A reopen must not unlock common content',
    })
    expect(stillLockedAfterReopen.error?.message).toContain('locked after the first processed task')

    const transfer = await leader.rpc('assign_product_and_transfer_change_tasks', {
      p_product_id: productId,
      p_user_id: memberBId,
      p_transfer_pending: true,
      p_reason: 'RLS product owner transfer',
    })
    expect(transfer.error).toBeNull()
    expect(Number(transfer.data)).toBeGreaterThanOrEqual(1)

    const transferred = await memberA
      .from('product_change_tasks')
      .select('id,status,assignee_id,assignee_name')
      .eq('id', task.data!.id)
      .single()
    expect(transferred.error).toBeNull()
    expect(transferred.data).toMatchObject({ id: task.data!.id, status: 'pending', assignee_id: memberBId })

    const newAssigneeCompletion = await memberB.rpc('complete_product_change_task', {
      p_task_id: task.data!.id,
      p_completion_note: 'Completed after explicit transfer',
      p_proxy_reason: null,
    })
    expect(newAssigneeCompletion.error).toBeNull()

    const automaticallyArchivedAgain = await memberB
      .from('change_applications')
      .select('archived_at,archived_by,archive_reason,archive_origin')
      .eq('id', applicationId)
      .single()
    expect(automaticallyArchivedAgain.error).toBeNull()
    expect(automaticallyArchivedAgain.data).toMatchObject({
      archived_by: null,
      archive_origin: 'automatic',
      archive_reason: '모든 제품 적용이 완료되어 자동 보관됨',
    })
    expect(automaticallyArchivedAgain.data?.archived_at).toBeTruthy()

    const leaderRestore = await leader.rpc('restore_change_application', {
      p_change_application_id: applicationId,
      p_reason: 'RLS manual restore verification',
    })
    expect(leaderRestore.error).toBeNull()
    const nonLeaderArchive = await memberB.rpc('archive_change_application', {
      p_change_application_id: applicationId,
      p_reason: 'RLS non-leader archive rejection',
    })
    expect(nonLeaderArchive.error).not.toBeNull()
    const leaderArchive = await leader.rpc('archive_change_application', {
      p_change_application_id: applicationId,
      p_reason: 'RLS manual archive verification',
    })
    expect(leaderArchive.error).toBeNull()
    const manuallyArchived = await leader
      .from('change_applications')
      .select('archived_at,archive_reason')
      .eq('id', applicationId)
      .single()
    expect(manuallyArchived.error).toBeNull()
    expect(manuallyArchived.data?.archive_reason).toBe('RLS manual archive verification')
    const finalRestore = await leader.rpc('restore_change_application', {
      p_change_application_id: applicationId,
      p_reason: 'Continue cancellation coverage',
    })
    expect(finalRestore.error).toBeNull()

    const cancelledApplication = await leader.rpc('cancel_change_application', {
      p_change_application_id: applicationId,
      p_reason: 'RLS retained cancelled history verification',
    })
    expect(cancelledApplication.error).toBeNull()
    const cancelledHistoryForAssignee = await memberB
      .from('product_change_tasks')
      .select('id,status,assignee_id')
      .eq('id', task.data!.id)
      .single()
    expect(cancelledHistoryForAssignee.error).toBeNull()
    expect(cancelledHistoryForAssignee.data).toMatchObject({
      id: task.data!.id,
      status: 'completed',
      assignee_id: memberBId,
    })

    const draftPayload = {
      ...payload,
      p_change_number: `${changeNumber}-PRIVATE-DRAFT`,
      p_tasks: [{ product_id: productId, assignee_id: memberBId, product_note: null }],
    }
    const draft = await memberA.rpc('save_change_application_draft', draftPayload)
    expect(draft.error).toBeNull()
    const draftApplicationId = draft.data as string
    const draftAction = await memberA
      .from('change_action_items')
      .select('id')
      .eq('change_application_id', draftApplicationId)
      .single()
    expect(draftAction.error).toBeNull()
    const draftTask = await memberA
      .from('product_change_tasks')
      .select('id')
      .eq('action_item_id', draftAction.data!.id)
      .single()
    expect(draftTask.error).toBeNull()

    const hiddenDraftApplication = await memberB
      .from('change_applications')
      .select('id')
      .eq('id', draftApplicationId)
    expect(hiddenDraftApplication.error).toBeNull()
    expect(hiddenDraftApplication.data).toEqual([])
    const hiddenDraftAction = await memberB
      .from('change_action_items')
      .select('id')
      .eq('id', draftAction.data!.id)
    expect(hiddenDraftAction.error).toBeNull()
    expect(hiddenDraftAction.data).toEqual([])
    const hiddenDraftTask = await memberB
      .from('product_change_tasks')
      .select('id')
      .eq('id', draftTask.data!.id)
    expect(hiddenDraftTask.error).toBeNull()
    expect(hiddenDraftTask.data).toEqual([])

    const cancelledDraftTask = await memberA.rpc('cancel_product_change_task', {
      p_task_id: draftTask.data!.id,
      p_reason: 'RLS cancelled task reactivation guard',
    })
    expect(cancelledDraftTask.error).toBeNull()
    const cancelledTaskSnapshot = await memberA
      .from('change_applications')
      .select('updated_at')
      .eq('id', draftApplicationId)
      .single()
    expect(cancelledTaskSnapshot.error).toBeNull()
    const silentReactivation = await memberA.rpc('save_change_application_draft', {
      ...draftPayload,
      p_change_application_id: draftApplicationId,
      p_expected_updated_at: cancelledTaskSnapshot.data!.updated_at,
    })
    expect(silentReactivation.error?.message).toContain('cancelled product change task cannot be reactivated')

    const replacementProduct = await leader
      .from('products')
      .insert({
        name: `RLS replacement product ${Date.now()}-${Math.random().toString(16).slice(2)}`,
        category: '자사',
        company_name: '자사',
      })
      .select('id')
      .single()
    expect(replacementProduct.error).toBeNull()
    const omittedCancelledTaskBypass = await memberA.rpc('save_change_application_draft', {
      ...draftPayload,
      p_change_application_id: draftApplicationId,
      p_expected_updated_at: cancelledTaskSnapshot.data!.updated_at,
      p_tasks: [{ product_id: replacementProduct.data!.id, assignee_id: null, product_note: null }],
    })
    expect(omittedCancelledTaskBypass.error?.message).toContain('cancelled product change task cannot be reactivated')

    const cancelledDraftApplication = await memberA.rpc('cancel_change_application', {
      p_change_application_id: draftApplicationId,
      p_reason: 'RLS cancelled unpublished draft privacy verification',
    })
    expect(cancelledDraftApplication.error).toBeNull()

    const hiddenCancelledDraftApplication = await memberB
      .from('change_applications')
      .select('id')
      .eq('id', draftApplicationId)
    expect(hiddenCancelledDraftApplication.error).toBeNull()
    expect(hiddenCancelledDraftApplication.data).toEqual([])
    const hiddenCancelledDraftAction = await memberB
      .from('change_action_items')
      .select('id')
      .eq('id', draftAction.data!.id)
    expect(hiddenCancelledDraftAction.error).toBeNull()
    expect(hiddenCancelledDraftAction.data).toEqual([])
    const hiddenCancelledDraftTask = await memberB
      .from('product_change_tasks')
      .select('id')
      .eq('id', draftTask.data!.id)
    expect(hiddenCancelledDraftTask.error).toBeNull()
    expect(hiddenCancelledDraftTask.data).toEqual([])
  })

  it('rejects stale creator and leader saves without overwriting the winning title or task scope', async () => {
    const memberAEmail = process.env.RLS_MEMBER_A_EMAIL
    const memberAPassword = process.env.RLS_MEMBER_A_PASSWORD
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD
    const productId = process.env.RLS_TEST_PRODUCT_ID
    if (!memberAEmail || !memberAPassword || !leaderEmail || !leaderPassword || !productId) {
      expect.fail('Set member A and leader credentials plus the product RLS fixture')
    }

    const memberA = createClient(url, anonKey, { auth: { persistSession: false } })
    const leader = createClient(url, anonKey, { auth: { persistSession: false } })
    expect((await memberA.auth.signInWithPassword({ email: memberAEmail, password: memberAPassword })).error).toBeNull()
    expect((await leader.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })).error).toBeNull()

    const replacementProduct = await leader
      .from('products')
      .insert({
        name: `RLS OCC replacement ${Date.now()}-${Math.random().toString(16).slice(2)}`,
        category: '자사',
        company_name: '자사',
      })
      .select('id')
      .single()
    expect(replacementProduct.error).toBeNull()

    const changeNumber = `RLS-OCC-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const payload = {
      p_change_application_id: null,
      p_expected_updated_at: null,
      p_change_number: changeNumber,
      p_source: 'official',
      p_title: 'OCC initial draft',
      p_summary: 'Optimistic concurrency control fixture',
      p_source_url: null,
      p_effective_date: '2099-02-01',
      p_action_kind: 'product_standard',
      p_custom_kind_name: null,
      p_action_content: 'Preserve the winning common content and product task',
      p_due_date: '2099-02-10',
      p_tasks: [{ product_id: productId, assignee_id: null, product_note: 'initial' }],
    }
    const draft = await memberA.rpc('save_change_application_draft', payload)
    expect(draft.error).toBeNull()
    const applicationId = draft.data as string

    const initialApplication = await memberA
      .from('change_applications')
      .select('updated_at')
      .eq('id', applicationId)
      .single()
    expect(initialApplication.error).toBeNull()
    const initialUpdatedAt = initialApplication.data!.updated_at

    const missingSnapshot = await leader.rpc('save_change_application_draft', {
      ...payload,
      p_change_application_id: applicationId,
      p_title: 'Missing snapshot must fail',
    })
    expect(missingSnapshot.error?.message).toContain('change application was modified by another user')

    const creatorFirst = await memberA.rpc('save_change_application_draft', {
      ...payload,
      p_change_application_id: applicationId,
      p_expected_updated_at: initialUpdatedAt,
      p_title: 'Creator winning write',
      p_tasks: [{ product_id: productId, assignee_id: null, product_note: 'creator-winner' }],
    })
    expect(creatorFirst.error).toBeNull()

    const staleLeader = await leader.rpc('save_change_application_draft', {
      ...payload,
      p_change_application_id: applicationId,
      p_expected_updated_at: initialUpdatedAt,
      p_title: 'Stale leader write must fail',
      p_tasks: [{ product_id: replacementProduct.data!.id, assignee_id: null, product_note: 'stale-leader' }],
    })
    expect(staleLeader.error?.message).toContain('change application was modified by another user')

    const creatorWinner = await memberA
      .from('change_applications')
      .select('title,updated_at')
      .eq('id', applicationId)
      .single()
    expect(creatorWinner.error).toBeNull()
    expect(creatorWinner.data?.title).toBe('Creator winning write')
    const action = await memberA
      .from('change_action_items')
      .select('id')
      .eq('change_application_id', applicationId)
      .single()
    expect(action.error).toBeNull()
    const tasksAfterCreatorWin = await memberA
      .from('product_change_tasks')
      .select('product_id,product_note,status')
      .eq('action_item_id', action.data!.id)
    expect(tasksAfterCreatorWin.error).toBeNull()
    expect(tasksAfterCreatorWin.data).toHaveLength(1)
    expect(tasksAfterCreatorWin.data?.[0]).toMatchObject({
      product_id: productId,
      product_note: 'creator-winner',
      status: 'pending',
    })

    const leaderFirst = await leader.rpc('save_change_application_draft', {
      ...payload,
      p_change_application_id: applicationId,
      p_expected_updated_at: creatorWinner.data!.updated_at,
      p_title: 'Leader winning write',
      p_tasks: [{ product_id: productId, assignee_id: null, product_note: 'leader-winner' }],
    })
    expect(leaderFirst.error).toBeNull()

    const leaderWinner = await memberA
      .from('change_applications')
      .select('title,updated_at')
      .eq('id', applicationId)
      .single()
    expect(leaderWinner.error).toBeNull()
    expect(leaderWinner.data?.title).toBe('Leader winning write')

    const staleCreator = await memberA.rpc('save_change_application_draft', {
      ...payload,
      p_change_application_id: applicationId,
      p_expected_updated_at: creatorWinner.data!.updated_at,
      p_title: 'Stale creator write must fail',
      p_tasks: [{ product_id: replacementProduct.data!.id, assignee_id: null, product_note: 'stale-creator' }],
    })
    expect(staleCreator.error?.message).toContain('change application was modified by another user')

    const finalApplication = await memberA
      .from('change_applications')
      .select('title,updated_at')
      .eq('id', applicationId)
      .single()
    expect(finalApplication.error).toBeNull()
    expect(finalApplication.data).toMatchObject({
      title: 'Leader winning write',
      updated_at: leaderWinner.data!.updated_at,
    })
    const tasksAfterLeaderWin = await memberA
      .from('product_change_tasks')
      .select('product_id,product_note,status')
      .eq('action_item_id', action.data!.id)
    expect(tasksAfterLeaderWin.error).toBeNull()
    expect(tasksAfterLeaderWin.data).toHaveLength(1)
    expect(tasksAfterLeaderWin.data?.[0]).toMatchObject({
      product_id: productId,
      product_note: 'leader-winner',
      status: 'pending',
    })
  })

  it('blocks an inactive member from registering change work', async () => {
    const email = process.env.RLS_INACTIVE_MEMBER_EMAIL
    const password = process.env.RLS_INACTIVE_MEMBER_PASSWORD
    const memberId = process.env.RLS_INACTIVE_MEMBER_USER_ID
    const productId = process.env.RLS_TEST_PRODUCT_ID
    if (!email || !password || !memberId || !productId) {
      expect.fail('Set inactive-member credentials/id and the product RLS fixture')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull()
    const result = await client.rpc('publish_change_application', {
      p_change_application_id: null,
      p_expected_updated_at: null,
      p_change_number: `RLS-INACTIVE-${Date.now()}`,
      p_source: 'official',
      p_title: 'Inactive registration must fail',
      p_summary: 'RLS guard fixture',
      p_source_url: null,
      p_effective_date: '2099-01-01',
      p_action_kind: 'product_standard',
      p_custom_kind_name: null,
      p_action_content: 'Must not be created',
      p_due_date: '2099-01-10',
      p_tasks: [{ product_id: productId, assignee_id: memberId, product_note: null }],
    })
    expect(result.error).not.toBeNull()
  })
})
