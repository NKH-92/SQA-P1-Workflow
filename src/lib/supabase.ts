import { createClient } from '@supabase/supabase-js'

export type AppMode = 'production' | 'preview' | 'development' | 'remote'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const appMode = import.meta.env.VITE_APP_MODE as AppMode | undefined

function isAllowedSupabaseUrl(value: string | undefined, mode: AppMode | undefined) {
  if (!value || value.includes('your-project-ref')) return false
  if (value.startsWith('https://')) return true
  if (mode !== 'remote') return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname)
  } catch {
    return false
  }
}

const hasRealSupabaseUrl = isAllowedSupabaseUrl(supabaseUrl, appMode)

const hasRealAnonKey = Boolean(
  supabaseAnonKey &&
    supabaseAnonKey !== 'your-public-anon-key',
)

export const hasSupabaseConfig = hasRealSupabaseUrl && hasRealAnonKey
export const isPreviewMode = appMode === 'preview' && !hasSupabaseConfig
export const isProductionMode = appMode === 'production'

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null
