import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
}

let targetUrl
try {
  targetUrl = new URL(url)
} catch {
  throw new Error('SQA_FIXTURE_TARGET_URL_INVALID')
}

const targetHostname = targetUrl.hostname
const isLocalTarget = targetHostname === 'localhost' || targetHostname === '127.0.0.1'
if (!isLocalTarget) {
  const targetProjectRef = process.env.RLS_REMOTE_TARGET_REF ?? ''
  const productionProjectRef = process.env.RLS_PRODUCTION_PROJECT_REF ?? ''
  const allowedTargetRefs = (process.env.RLS_ALLOWED_TARGET_REFS ?? '').split(/[\s,]+/).filter(Boolean)
  const remoteDisposableConfirmed = process.env.RLS_ALLOW_REMOTE_DISPOSABLE === '1'
    && process.env.RLS_CONFIRM_DISPOSABLE_TARGET === 'true'
    && /^[a-z0-9]{20}$/.test(targetProjectRef)
    && /^[a-z0-9]{20}$/.test(productionProjectRef)
    && targetProjectRef !== productionProjectRef
    && allowedTargetRefs.includes(targetProjectRef)
    && targetUrl.protocol === 'https:'
    && targetHostname === `${targetProjectRef}.supabase.co`
    && targetUrl.pathname === '/'
    && !targetUrl.search
    && !targetUrl.hash

  if (!remoteDisposableConfirmed) throw new Error('SQA_FIXTURE_NON_LOCAL_TARGET')
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const password = 'Rls-Test-Password-2026!'
const users = [
  { key: 'leader', email: 'rls-leader@example.test', name: 'RLS Leader', role: 'leader', active: true },
  { key: 'memberA', email: 'rls-member-a@example.test', name: 'RLS Member A', role: 'member', active: true },
  { key: 'memberB', email: 'rls-member-b@example.test', name: 'RLS Member B', role: 'member', active: true },
  { key: 'inactive', email: 'rls-inactive@example.test', name: 'RLS Inactive', role: 'member', active: false },
  { key: 'pending', email: 'rls-pending-password@example.test', name: 'RLS Pending Password', role: 'member', active: true, mustChangePassword: true },
  { key: 'leaderB', email: 'rls-leader-b@example.test', name: 'RLS Leader B', role: 'leader', active: true },
  { key: 'pendingHardened', email: 'rls-pending-password-hardened@example.test', name: 'RLS Hardened Pending Password', role: 'member', active: true, mustChangePassword: true },
]

const { error: allowedError } = await admin.from('allowed_users').insert(
  users.map(({ email, name, role }) => ({ email, name, role })),
)
if (allowedError) throw allowedError

const created = {}
for (const user of users) {
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error(`Failed to create ${user.key}`)
  created[user.key] = data.user
}

for (const user of users) {
  const { error } = await admin
    .from('profiles')
    .update({ is_active: user.active, must_change_password: user.mustChangePassword ?? false })
    .eq('id', created[user.key].id)
  if (error) throw error
}

const { data: product, error: productError } = await admin
  .from('products')
  .insert({ name: 'RLS Test Product', category: '자사', company_name: '자사' })
  .select('id')
  .single()
if (productError || !product) throw productError ?? new Error('Failed to create test product')

const { data: dutyCategory, error: dutyCategoryError } = await admin
  .from('duty_major_categories')
  .insert({ name: 'RLS Test Category', sort_order: 999 })
  .select('id')
  .single()
if (dutyCategoryError || !dutyCategory) {
  throw dutyCategoryError ?? new Error('Failed to create test duty category')
}
const { data: duty, error: dutyError } = await admin
  .from('duties')
  .insert({ name: 'RLS Test Duty', major_category_id: dutyCategory.id })
  .select('id')
  .single()
if (dutyError || !duty) throw dutyError ?? new Error('Failed to create test duty')

const { data: project, error: projectError } = await admin
  .from('projects')
  .insert({ name: 'RLS Test Project', description: 'RLS fixture', status: 'planned', created_by: created.leader.id })
  .select('id, updated_at')
  .single()
if (projectError || !project) throw projectError ?? new Error('Failed to create test project')

const { data: reviews, error: reviewsError } = await admin
  .from('review_requests')
  .insert([
    { requester_id: created.memberA.id, title: 'Member A pending', description: 'RLS fixture', status: 'pending', rejection_count: 0 },
    { requester_id: created.memberB.id, title: 'Member B pending', description: 'RLS fixture', status: 'pending', rejection_count: 0 },
    { requester_id: created.memberA.id, title: 'Hardened OCC approval fixture', description: 'RLS fixture', status: 'pending', rejection_count: 0 },
    { requester_id: created.memberA.id, title: 'Hardened withdrawal fixture', description: 'RLS fixture', status: 'pending', rejection_count: 0 },
    { requester_id: created.memberA.id, title: 'Hardened receipt fixture', description: 'RLS fixture', status: 'pending', rejection_count: 0 },
    { requester_id: created.memberA.id, title: 'Hardened feedback fixture', description: 'RLS fixture', status: 'rejected', rejection_count: 1 },
    { requester_id: created.memberA.id, title: 'Closed concurrency fixture', description: 'RLS fixture', status: 'rejected', rejection_count: 1 },
    { requester_id: created.memberA.id, title: 'Closed leader fixture', description: 'RLS fixture', status: 'rejected', rejection_count: 1 },
    { requester_id: created.memberA.id, title: 'Closed member fixture', description: 'RLS fixture', status: 'rejected', rejection_count: 1 },
    { requester_id: created.memberA.id, title: 'Resubmit history fixture', description: 'RLS fixture', status: 'rejected', rejection_count: 1 },
    { requester_id: created.memberA.id, title: 'Resubmit concurrency fixture', description: 'RLS fixture', status: 'rejected', rejection_count: 1 },
  ])
  .select('id, requester_id, title')
if (reviewsError || !reviews) throw reviewsError ?? new Error('Failed to create review fixtures')

const reviewByTitle = new Map(reviews.map((item) => [item.title, item]))
const memberAReview = reviewByTitle.get('Member A pending')
const memberBReview = reviewByTitle.get('Member B pending')
const hardenedOccReview = reviewByTitle.get('Hardened OCC approval fixture')
const hardenedWithdrawalReview = reviewByTitle.get('Hardened withdrawal fixture')
const hardenedReceiptReview = reviewByTitle.get('Hardened receipt fixture')
const hardenedFeedbackReview = reviewByTitle.get('Hardened feedback fixture')
const closedConcurrencyReview = reviewByTitle.get('Closed concurrency fixture')
const closedLeaderReview = reviewByTitle.get('Closed leader fixture')
const closedMemberReview = reviewByTitle.get('Closed member fixture')
const resubmitHistoryReview = reviewByTitle.get('Resubmit history fixture')
const resubmitConcurrencyReview = reviewByTitle.get('Resubmit concurrency fixture')
if (
  !memberAReview || !memberBReview || !hardenedOccReview || !hardenedWithdrawalReview ||
  !hardenedReceiptReview || !hardenedFeedbackReview || !closedConcurrencyReview || !closedLeaderReview ||
  !closedMemberReview || !resubmitHistoryReview || !resubmitConcurrencyReview
) throw new Error('Review fixture ids are incomplete')

const { data: feedbackRows, error: feedbackError } = await admin
  .from('review_feedback')
  .insert([
    { review_request_id: closedLeaderReview.id, leader_id: created.leader.id, comment: 'Owner feedback' },
    { review_request_id: closedMemberReview.id, leader_id: created.leaderB.id, comment: 'Other leader feedback' },
    { review_request_id: resubmitHistoryReview.id, leader_id: created.leader.id, comment: 'Initial rejection reason' },
    { review_request_id: resubmitConcurrencyReview.id, leader_id: created.leader.id, comment: 'Concurrency rejection reason' },
    { review_request_id: hardenedFeedbackReview.id, leader_id: created.leader.id, comment: 'Hardened feedback' },
  ])
  .select('id, review_request_id, leader_id')
if (feedbackError || !feedbackRows || feedbackRows.length !== 5) {
  throw feedbackError ?? new Error('Feedback fixture ids are incomplete')
}

// Remote browser contract: published change application with a task owned by member A.
const anonKey = process.env.SUPABASE_ANON_KEY
if (!anonKey) throw new Error('SUPABASE_ANON_KEY is required to publish change-application fixtures')
const memberAClient = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const memberASignIn = await memberAClient.auth.signInWithPassword({
  email: users[1].email,
  password,
})
if (memberASignIn.error) throw memberASignIn.error
const changeNumber = `RLS-E2E-${Date.now()}`
const publishedChange = await memberAClient.rpc('publish_change_application', {
  p_change_application_id: null,
  p_expected_updated_at: null,
  p_change_number: changeNumber,
  p_source: 'official',
  p_title: 'Remote E2E owned task',
  p_summary: 'Fixture for assigned change-task owner success path',
  p_source_url: null,
  p_effective_date: '2099-01-01',
  p_action_kind: 'product_standard',
  p_custom_kind_name: null,
  p_action_content: 'Complete the controlled product update',
  p_due_date: '2099-01-10',
  p_tasks: [{ product_id: product.id, assignee_id: created.memberA.id, product_note: null }],
})
if (publishedChange.error || typeof publishedChange.data !== 'string') {
  throw publishedChange.error ?? new Error('Failed to publish change-application fixture')
}
const { data: ownedTask, error: ownedTaskError } = await admin
  .from('product_change_tasks')
  .select('id, assignee_id, status')
  .eq('assignee_id', created.memberA.id)
  .eq('status', 'pending')
  .limit(1)
  .maybeSingle()
if (ownedTaskError || !ownedTask) {
  throw ownedTaskError ?? new Error('Owned change-task fixture is missing')
}

const output = {
  RLS_LEADER_EMAIL: users[0].email,
  RLS_LEADER_PASSWORD: password,
  RLS_LEADER_USER_ID: created.leader.id,
  RLS_MEMBER_A_EMAIL: users[1].email,
  RLS_MEMBER_A_PASSWORD: password,
  RLS_MEMBER_A_USER_ID: created.memberA.id,
  RLS_MEMBER_B_USER_ID: created.memberB.id,
  RLS_MEMBER_B_EMAIL: users[2].email,
  RLS_MEMBER_B_PASSWORD: password,
  RLS_INACTIVE_MEMBER_EMAIL: users[3].email,
  RLS_INACTIVE_MEMBER_PASSWORD: password,
  RLS_INACTIVE_MEMBER_USER_ID: created.inactive.id,
  RLS_PENDING_PASSWORD_EMAIL: users[4].email,
  RLS_PENDING_PASSWORD: password,
  RLS_PENDING_PASSWORD_USER_ID: created.pending.id,
  RLS_HARDENED_PENDING_PASSWORD_EMAIL: users.find((user) => user.key === 'pendingHardened').email,
  RLS_HARDENED_PENDING_PASSWORD: password,
  RLS_HARDENED_PENDING_PASSWORD_USER_ID: created.pendingHardened.id,
  RLS_TEST_PRODUCT_ID: product.id,
  RLS_TEST_DUTY_ID: duty.id,
  RLS_TEST_PROJECT_ID: project.id,
  RLS_TEST_PROJECT_UPDATED_AT: project.updated_at,
  RLS_MEMBER_A_PENDING_REVIEW_REQUEST_ID: memberAReview.id,
  RLS_MEMBER_B_REVIEW_REQUEST_ID: memberBReview.id,
  RLS_HARDENED_OCC_REVIEW_REQUEST_ID: hardenedOccReview.id,
  RLS_HARDENED_WITHDRAW_REVIEW_REQUEST_ID: hardenedWithdrawalReview.id,
  RLS_HARDENED_RECEIPT_REVIEW_REQUEST_ID: hardenedReceiptReview.id,
  RLS_HARDENED_FEEDBACK_ID: feedbackRows[4].id,
  RLS_CLOSED_CONCURRENCY_REVIEW_REQUEST_ID: closedConcurrencyReview.id,
  RLS_CLOSED_LEADER_REVIEW_REQUEST_ID: closedLeaderReview.id,
  RLS_CLOSED_MEMBER_REVIEW_REQUEST_ID: closedMemberReview.id,
  RLS_RESUBMIT_HISTORY_REVIEW_REQUEST_ID: resubmitHistoryReview.id,
  RLS_RESUBMIT_CONCURRENCY_REVIEW_REQUEST_ID: resubmitConcurrencyReview.id,
  RLS_FEEDBACK_OWNER_ID: feedbackRows[0].id,
  RLS_FEEDBACK_OTHER_AUTHOR_ID: feedbackRows[1].id,
  RLS_LEADER_B_EMAIL: users.find((user) => user.key === 'leaderB').email,
  RLS_LEADER_B_PASSWORD: password,
  RLS_LEADER_B_USER_ID: created.leaderB.id,
  RLS_OWNED_CHANGE_APPLICATION_ID: publishedChange.data,
  RLS_OWNED_CHANGE_TASK_ID: ownedTask.id,
}

for (const [key, value] of Object.entries(output)) console.log(`${key}=${value}`)
