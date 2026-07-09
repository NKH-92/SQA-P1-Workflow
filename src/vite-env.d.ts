/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: 'production' | 'preview' | 'development'
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** @fontsource-* 패키지는 CSS만 내보내는 side-effect import라 타입 선언이 없다. */
declare module '@fontsource-variable/*'
