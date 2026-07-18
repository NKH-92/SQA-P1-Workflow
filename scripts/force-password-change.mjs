import { createClient } from '@supabase/supabase-js'

const rawArgs = process.argv.slice(2)
const execute = rawArgs.includes('--execute')
const confirmed = rawArgs.includes('--confirm=FORCE_PASSWORD_CHANGE')
const allActive = rawArgs.includes('--all-active')
const userId = rawArgs.find((arg) => arg.startsWith('--user-id='))?.slice('--user-id='.length)
const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
if ((!allActive && !userId) || (allActive && userId)) throw new Error('Choose exactly one of --all-active or --user-id=<uuid>.')
if (execute && !confirmed) throw new Error('Execution requires --confirm=FORCE_PASSWORD_CHANGE.')

const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
let query = client.from('profiles').select('id', { count: 'exact' }).eq('must_change_password', false)
query = allActive ? query.eq('is_active', true) : query.eq('id', userId)
const { data, count, error } = await query
if (error) throw error
console.log(JSON.stringify({ mode: execute ? 'execute' : 'dry-run', targetCount: count ?? data?.length ?? 0, scope: allActive ? 'all-active' : 'single-user' }))
if (!execute || !data?.length) process.exit(0)
const ids = data.map((profile) => profile.id)
const { error: updateError } = await client.from('profiles').update({ must_change_password: true }).in('id', ids)
if (updateError) throw updateError
console.log(JSON.stringify({ updatedCount: ids.length }))
