import { createClient } from '@supabase/supabase-js'

export type AppMode = 'production' | 'preview' | 'development'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const appMode = import.meta.env.VITE_APP_MODE as AppMode | undefined

const hasRealSupabaseUrl = Boolean(
  supabaseUrl &&
    supabaseUrl.startsWith('https://') &&
    !supabaseUrl.includes('your-project-ref'),
)

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
