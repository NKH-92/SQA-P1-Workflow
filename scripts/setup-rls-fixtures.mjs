import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
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
const closedConcurrencyReview = reviewByTitle.get('Closed concurrency fixture')
const closedLeaderReview = reviewByTitle.get('Closed leader fixture')
const closedMemberReview = reviewByTitle.get('Closed member fixture')
const resubmitHistoryReview = reviewByTitle.get('Resubmit history fixture')
const resubmitConcurrencyReview = reviewByTitle.get('Resubmit concurrency fixture')
if (
  !memberAReview || !memberBReview || !closedConcurrencyReview || !closedLeaderReview ||
  !closedMemberReview || !resubmitHistoryReview || !resubmitConcurrencyReview
) throw new Error('Review fixture ids are incomplete')

const { data: feedbackRows, error: feedbackError } = await admin
  .from('review_feedback')
  .insert([
    { review_request_id: closedLeaderReview.id, leader_id: created.leader.id, comment: 'Owner feedback' },
    { review_request_id: closedMemberReview.id, leader_id: created.leaderB.id, comment: 'Other leader feedback' },
    { review_request_id: resubmitHistoryReview.id, leader_id: created.leader.id, comment: 'Initial rejection reason' },
    { review_request_id: resubmitConcurrencyReview.id, leader_id: created.leader.id, comment: 'Concurrency rejection reason' },
  ])
  .select('id, review_request_id, leader_id')
if (feedbackError || !feedbackRows || feedbackRows.length !== 4) {
  throw feedbackError ?? new Error('Feedback fixture ids are incomplete')
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
  RLS_TEST_PRODUCT_ID: product.id,
  RLS_TEST_DUTY_ID: duty.id,
  RLS_TEST_PROJECT_ID: project.id,
  RLS_TEST_PROJECT_UPDATED_AT: project.updated_at,
  RLS_MEMBER_A_PENDING_REVIEW_REQUEST_ID: memberAReview.id,
  RLS_MEMBER_B_REVIEW_REQUEST_ID: memberBReview.id,
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
}

for (const [key, value] of Object.entries(output)) console.log(`${key}=${value}`)
