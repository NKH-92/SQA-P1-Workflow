import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const args = new Set(process.argv.slice(2))
const execute = args.has('--execute')
const confirmed = args.has('--confirm=PURGE_REVIEW_ATTACHMENTS')
const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const bucket = process.env.REVIEW_ATTACHMENT_BUCKET || 'review-attachments'

if (!url || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
if (execute && !confirmed) throw new Error('Execution requires --confirm=PURGE_REVIEW_ATTACHMENTS.')

const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

async function listAllObjects() {
  const files = []
  const prefixes = ['']
  while (prefixes.length > 0) {
    const prefix = prefixes.shift()
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await client.storage.from(bucket).list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw error
      for (const entry of data ?? []) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.id == null) prefixes.push(path)
        else files.push(path)
      }
      if ((data ?? []).length < 100) break
    }
  }
  return [...new Set(files)].sort()
}

const objects = await listAllObjects()
const digest = createHash('sha256').update(objects.join('\n')).digest('hex')
console.log(JSON.stringify({ mode: execute ? 'execute' : 'dry-run', bucket, objectCount: objects.length, nameDigestSha256: digest }))

if (!execute) process.exit(0)
for (let index = 0; index < objects.length; index += 100) {
  const { error } = await client.storage.from(bucket).remove(objects.slice(index, index + 100))
  if (error) throw error
}
const remaining = await listAllObjects()
console.log(JSON.stringify({ verifiedRemainingObjectCount: remaining.length }))
if (remaining.length !== 0) throw new Error('Purge verification failed: objects remain in the bucket.')
