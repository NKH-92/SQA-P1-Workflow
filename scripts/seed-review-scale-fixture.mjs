/**
 * Bounded review-query scale fixture: seeds >=10k requests, 100k events, and
 * 10k receipts for one user.
 * Intended for local Supabase / CI RLS gate only (service role).
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const userId = process.env.RLS_SCALE_USER_ID
const REQUESTS = Number(process.env.RLS_SCALE_REQUESTS ?? 10_000)
const EVENTS = Number(process.env.RLS_SCALE_EVENTS ?? 100_000)
const RECEIPTS = Number(process.env.RLS_SCALE_RECEIPTS ?? 10_000)

if (!url || !serviceKey || !userId) {
  throw new Error('SQA_SCALE_FIXTURE_ENV_MISSING: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RLS_SCALE_USER_ID')
}

let targetHostname
try {
  targetHostname = new URL(url).hostname
} catch {
  throw new Error('SQA_FIXTURE_TARGET_URL_INVALID')
}
if (targetHostname !== 'localhost' && targetHostname !== '127.0.0.1') {
  throw new Error('SQA_FIXTURE_NON_LOCAL_TARGET')
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const batchSize = 500
const requestIds = []
const eventIdsByRequest = new Map()

for (let offset = 0; offset < REQUESTS; offset += batchSize) {
  const chunk = Array.from({ length: Math.min(batchSize, REQUESTS - offset) }, (_, index) => ({
    requester_id: userId,
    title: `scale-${offset + index}`,
    description: 'bounded review-query scale fixture',
    status: offset + index < 50 ? 'pending' : 'approved',
    review_round: 1,
    rejection_count: 0,
  }))
  const { data, error } = await admin.from('review_requests').insert(chunk).select('id')
  if (error) throw error
  for (const row of data ?? []) requestIds.push(row.id)
}

for (let offset = 0; offset < EVENTS; offset += batchSize) {
  const chunk = Array.from({ length: Math.min(batchSize, EVENTS - offset) }, (_, index) => {
    const requestId = requestIds[(offset + index) % requestIds.length]
    return {
      review_request_id: requestId,
      event_type: (offset + index) % 7 === 0 ? 'submitted' : 'approved',
      actor_id: userId,
      actor_name_snapshot: 'scale',
      from_status: null,
      to_status: 'approved',
    }
  })
  const { data, error } = await admin.from('review_events').insert(chunk).select('id, review_request_id')
  if (error) throw error
  for (const row of data ?? []) {
    if (!eventIdsByRequest.has(row.review_request_id)) {
      eventIdsByRequest.set(row.review_request_id, row.id)
    }
  }
}

for (let offset = 0; offset < RECEIPTS; offset += batchSize) {
  const chunk = []
  for (let index = 0; index < Math.min(batchSize, RECEIPTS - offset); index += 1) {
    const requestId = requestIds[(offset + index) % requestIds.length]
    const eventId = eventIdsByRequest.get(requestId)
    if (!eventId) continue
    chunk.push({
      review_request_id: requestId,
      user_id: userId,
      last_seen_event_id: eventId,
    })
  }
  if (chunk.length === 0) continue
  const { error } = await admin.from('review_read_receipts').upsert(chunk, {
    onConflict: 'user_id,review_request_id',
    ignoreDuplicates: true,
  })
  if (error) throw error
}

console.log(`SQA_SCALE_FIXTURE_OK requests=${requestIds.length} events=${EVENTS} receipts=${RECEIPTS}`)
