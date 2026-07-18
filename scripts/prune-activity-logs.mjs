import { createClient } from '@supabase/supabase-js'

const rawArgs = process.argv.slice(2)
const execute = rawArgs.includes('--execute')
const confirmed = rawArgs.includes('--confirm=PRUNE_ACTIVITY_LOGS')
const daysArg = rawArgs.find((arg) => arg.startsWith('--retention-days='))
const retentionDays = Number(daysArg?.slice('--retention-days='.length) ?? 180)
const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
if (!Number.isInteger(retentionDays) || retentionDays < 30) throw new Error('retention-days must be an integer of at least 30.')
if (execute && !confirmed) throw new Error('Execution requires --confirm=PRUNE_ACTIVITY_LOGS.')

const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString()
const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const { count, error } = await client.from('activity_logs').select('id', { count: 'exact', head: true }).lt('created_at', cutoff)
if (error) throw error
console.log(JSON.stringify({ mode: execute ? 'execute' : 'dry-run', retentionDays, cutoff, candidateCount: count ?? 0, auditEventsAffected: 0 }))
if (!execute || !count) process.exit(0)
const { error: deleteError } = await client.from('activity_logs').delete().lt('created_at', cutoff)
if (deleteError) throw deleteError
console.log(JSON.stringify({ prunedCount: count }))
