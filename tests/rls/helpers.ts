const LOCAL_HOSTS = ['127.0.0.1', 'localhost']
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/

export function getSupabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
}

export function isSupabaseRlsTargetConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  if (!url) return false
  try {
    const { hostname } = new URL(url)
    if (LOCAL_HOSTS.includes(hostname)) return true
    const targetRef = env.RLS_REMOTE_TARGET_REF ?? ''
    const productionRef = env.RLS_PRODUCTION_PROJECT_REF ?? ''
    const allowedRefs = (env.RLS_ALLOWED_TARGET_REFS ?? '')
      .split(/[\s,]+/)
      .filter(Boolean)
    return env.RLS_ALLOW_REMOTE_DISPOSABLE === '1'
      && env.RLS_CONFIRM_DISPOSABLE_TARGET === 'true'
      && PROJECT_REF_PATTERN.test(targetRef)
      && PROJECT_REF_PATTERN.test(productionRef)
      && targetRef !== productionRef
      && allowedRefs.includes(targetRef)
      && hostname === `${targetRef}.supabase.co`
  } catch {
    return false
  }
}

if (process.env.RLS_REQUIRED === '1' && !isSupabaseRlsTargetConfigured()) {
  throw new Error(
    'RLS_REQUIRED=1 but no approved local or disposable remote Supabase target is configured.',
  )
}

export const RLS_SKIP_NOTE =
  'Requires Supabase local or an explicitly confirmed and allowlisted disposable remote target.'
