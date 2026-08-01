import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type ChangeApprovalFixture = {
  changeNumber: string
  title: string
  memberA: { id: string; name: string }
  memberB: { id: string; name: string }
  products: [
    { id: string; name: string; assigneeId: string },
    { id: string; name: string; assigneeId: string },
  ]
}

export type ChangeApprovalSnapshot = {
  application: {
    id: string
    archived_at: string | null
    final_completed_at: string | null
  }
  tasks: Array<{
    id: string
    product_id: string
    product_name: string
    assignee_id: string | null
    status: 'pending' | 'completed' | 'not_applicable' | 'cancelled'
  }>
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required change-approval E2E env: ${name}`)
  return value
}

function adminClient(): SupabaseClient {
  return createClient(
    requiredEnvironment('SUPABASE_URL'),
    requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function requireProfile(client: SupabaseClient, email: string) {
  const { data, error } = await client
    .from('profiles')
    .select('id, name')
    .eq('email', email)
    .single()
  if (error || !data) throw error ?? new Error(`Profile fixture missing for ${email}`)
  return data as { id: string; name: string }
}

export async function createChangeApprovalFixture(): Promise<ChangeApprovalFixture> {
  const client = adminClient()
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  const [memberA, memberB] = await Promise.all([
    requireProfile(client, requiredEnvironment('REMOTE_E2E_MEMBER_A_EMAIL')),
    requireProfile(client, requiredEnvironment('REMOTE_E2E_MEMBER_B_EMAIL')),
  ])
  const productNames = [
    `E2E 공통변경 제품 A ${suffix}`,
    `E2E 공통변경 제품 B ${suffix}`,
  ] as const
  const { data: products, error: productError } = await client
    .from('products')
    .insert(productNames.map((name, index) => ({
      name,
      category: index === 0 ? '자사' : '위탁',
      company_name: 'E2E 승인 검증',
      sort_order: 90_000 + index,
    })))
    .select('id, name')
  if (productError || !products || products.length !== 2) {
    throw productError ?? new Error('Failed to create change-approval E2E products')
  }
  const productA = products.find((product) => product.name === productNames[0])
  const productB = products.find((product) => product.name === productNames[1])
  if (!productA || !productB) throw new Error('Change-approval E2E products are incomplete')

  const { error: assignmentError } = await client.from('product_assignments').insert([
    { product_id: productA.id, user_id: memberA.id },
    { product_id: productB.id, user_id: memberB.id },
  ])
  if (assignmentError) {
    await client.from('products').delete().in('id', [productA.id, productB.id])
    throw assignmentError
  }

  return {
    changeNumber: `E2E-FA-${suffix}`,
    title: `공통변경 최종 승인 ${suffix}`,
    memberA,
    memberB,
    products: [
      { id: productA.id, name: productA.name, assigneeId: memberA.id },
      { id: productB.id, name: productB.name, assigneeId: memberB.id },
    ],
  }
}

export async function readChangeApprovalSnapshot(
  fixture: ChangeApprovalFixture,
): Promise<ChangeApprovalSnapshot> {
  const client = adminClient()
  const applicationResult = await client
    .from('change_applications')
    .select('id, archived_at, final_completed_at')
    .eq('change_number', fixture.changeNumber)
    .single()
  if (applicationResult.error || !applicationResult.data) {
    throw applicationResult.error ?? new Error('Change-approval E2E application is missing')
  }
  const actionResult = await client
    .from('change_action_items')
    .select('id')
    .eq('change_application_id', applicationResult.data.id)
  if (actionResult.error || !actionResult.data?.length) {
    throw actionResult.error ?? new Error('Change-approval E2E action item is missing')
  }
  const taskResult = await client
    .from('product_change_tasks')
    .select('id, product_id, product_name, assignee_id, status')
    .in('action_item_id', actionResult.data.map((row) => row.id))
    .order('product_name')
  if (taskResult.error || !taskResult.data) throw taskResult.error
  return {
    application: applicationResult.data as ChangeApprovalSnapshot['application'],
    tasks: taskResult.data as ChangeApprovalSnapshot['tasks'],
  }
}

export async function cleanupChangeApprovalFixture(fixture: ChangeApprovalFixture) {
  const client = adminClient()
  const application = await client
    .from('change_applications')
    .select('id')
    .eq('change_number', fixture.changeNumber)
    .maybeSingle()
  if (application.error) throw application.error
  if (application.data?.id) {
    const deletion = await client.from('change_applications').delete().eq('id', application.data.id)
    if (deletion.error) throw deletion.error
  }
  const productIds = fixture.products.map((product) => product.id)
  const assignmentDeletion = await client.from('product_assignments').delete().in('product_id', productIds)
  if (assignmentDeletion.error) throw assignmentDeletion.error
  const productDeletion = await client.from('products').delete().in('id', productIds)
  if (productDeletion.error) throw productDeletion.error
}
