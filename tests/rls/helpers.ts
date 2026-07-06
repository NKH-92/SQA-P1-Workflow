const LOCAL_HOSTS = ['127.0.0.1', 'localhost']

export function getSupabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
}

export function isSupabaseLocalConfigured(): boolean {
  const url = getSupabaseUrl()
  if (!url) return false
  try {
    const { hostname } = new URL(url)
    return LOCAL_HOSTS.includes(hostname)
  } catch {
    return false
  }
}

export const RLS_SKIP_NOTE =
  'Requires Supabase local (SUPABASE_URL=http://127.0.0.1:54321). See tests/rls/setup.sql.'
