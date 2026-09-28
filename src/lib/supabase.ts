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

/**
 * PostgREST(테이블·RPC) 요청의 시간 제한. 응답 없는 연결 하나가 전역 저장 가드(useMutationRunner)를
 * 계속 붙잡지 않게 끊고, 기존 오류 경로(연결 실패 안내 → 목록 다시 불러오기)로 보낸다.
 * 인증·Edge Function·Storage 요청에는 걸리지 않는다.
 */
export const POSTGREST_TIMEOUT_MS = 60_000

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      db: {
        timeout: POSTGREST_TIMEOUT_MS,
      },
    })
  : null
