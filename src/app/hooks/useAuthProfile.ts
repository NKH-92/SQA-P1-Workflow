import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createPreviewData, previewLeader as demoLeader } from '../../demoData'
import { emptyData } from '../constants'
import { toUserMessage } from '../../lib/errors'
import { hasSupabaseConfig, isPreviewMode, supabase } from '../../lib/supabase'
import { clearViewState } from '../../hooks/useViewState'
import type { AppData, Profile } from '../../types'
import type { SetToast } from '../types'

const AUTH_BOOTSTRAP_TIMEOUT_MS = 10_000
const AUTH_SESSION_TIMEOUT_MS = 8_000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(label)), timeoutMs)
    }),
  ])
}

async function loadProfileForSession(): Promise<{ profile: Profile | null; inactive: boolean; invalidSession: boolean }> {
  if (!supabase) return { profile: null, inactive: false, invalidSession: false }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return { profile: null, inactive: false, invalidSession: true }
  }

  const { data: profileRow, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (error) throw error
  if (!profileRow) return { profile: null, inactive: false, invalidSession: false }
  const profile = profileRow as Profile
  if (profile.is_active === false) return { profile: null, inactive: true, invalidSession: false }
  return { profile, inactive: false, invalidSession: false }
}

export function useAuthProfile(
  refreshData: (options?: { initial?: boolean }) => Promise<void>,
  setData: React.Dispatch<React.SetStateAction<AppData>>,
  setMessage: SetToast,
  resetNavigation: () => void,
  resetSyncState: () => void,
) {
  const previewEnabled = isPreviewMode

  const [sessionUser, setSessionUser] = useState<User | null | undefined>(hasSupabaseConfig ? undefined : null)
  const [profile, setProfile] = useState<Profile | null>(previewEnabled ? demoLeader : null)
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig)
  const [sessionWithoutProfile, setSessionWithoutProfile] = useState(false)
  /** 프로필은 있지만 비활성인 계정. 등록되지 않은 계정(sessionWithoutProfile만 true)과 안내가 다르다. */
  const [profileInactive, setProfileInactive] = useState(false)
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null)
  const [profileRetryTick, setProfileRetryTick] = useState(0)
  const [initialLoading, setInitialLoading] = useState(hasSupabaseConfig)
  const bootstrapDoneRef = useRef(false)
  const profileLoadGenerationRef = useRef(0)
  const refreshDataRef = useRef(refreshData)

  useEffect(() => {
    refreshDataRef.current = refreshData
  }, [refreshData])

  const profileEffectKey =
    sessionUser === undefined ? 'auth-pending' : (sessionUser?.id ?? 'signed-out')

  useEffect(() => {
    const client = supabase
    if (!client) return

    let cancelled = false

    const completeBootstrap = (user: User | null) => {
      if (cancelled || bootstrapDoneRef.current) return
      bootstrapDoneRef.current = true
      window.clearTimeout(timeoutId)
      setSessionUser(user)
      setAuthReady(true)
      if (!user) setInitialLoading(false)
    }

    const timeoutId = window.setTimeout(() => {
      if (cancelled || bootstrapDoneRef.current) return
      void client.auth.signOut()
      completeBootstrap(null)
      setInitialLoading(false)
      setMessage({
        text: '로그인 정보를 확인하지 못했어요. 다시 로그인해 주세요.',
        tone: 'warning',
      })
    }, AUTH_BOOTSTRAP_TIMEOUT_MS)

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (cancelled) return

      const user = session?.user ?? null
      setSessionUser(user)

      if (
        event === 'INITIAL_SESSION' ||
        event === 'SIGNED_IN' ||
        event === 'SIGNED_OUT' ||
        event === 'TOKEN_REFRESHED'
      ) {
        completeBootstrap(user)
      }
    })

    void withTimeout(client.auth.getSession(), AUTH_SESSION_TIMEOUT_MS, 'auth-session-timeout')
      .then(({ data: sessionData }) => {
        completeBootstrap(sessionData.session?.user ?? null)
      })
      .catch(() => {
        void client.auth.signOut()
        completeBootstrap(null)
        setInitialLoading(false)
      })

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, [setMessage])

  useEffect(() => {
    if (!supabase || profileEffectKey === 'auth-pending') return

    if (profileEffectKey === 'signed-out') {
      resetSyncState()
      setProfile(null)
      setSessionWithoutProfile(false)
      setProfileInactive(false)
      setProfileLoadError(null)
      setData(emptyData)
      setInitialLoading(false)
      return
    }

    let cancelled = false
    const generation = ++profileLoadGenerationRef.current
    void (async () => {
      setInitialLoading(true)
      setProfileLoadError(null)
      try {
        const result = await loadProfileForSession()
        if (cancelled || profileLoadGenerationRef.current !== generation) return

        if (result.invalidSession) {
          await supabase.auth.signOut()
          setSessionUser(null)
          setProfile(null)
          setSessionWithoutProfile(false)
          setData(emptyData)
          return
        }

        if (result.inactive) {
          setProfile(null)
          setSessionWithoutProfile(true)
          setProfileInactive(true)
          setProfileLoadError(null)
          return
        }

        if (result.profile) {
          // 로그인 전에 쌓인 안내(로그인 정보 확인 실패·프로필 오류 등)는 이제 맞지 않으므로 지운다.
          // 사용자가 닫을 때까지 남기기로 한 안내(persistent)는 그대로 둔다.
          setMessage(null)
          setProfile(result.profile)
          setSessionWithoutProfile(false)
          setProfileInactive(false)
          setProfileLoadError(null)
          // Password-pending users must be able to read their own profile so
          // the change-password route can render, but every app-data bootstrap
          // is deliberately blocked by can_use_app() until the change finishes.
          if (!result.profile.must_change_password) {
            await refreshDataRef.current({ initial: true })
          }
        } else {
          setProfile(null)
          setSessionWithoutProfile(true)
          setProfileInactive(false)
          setProfileLoadError(null)
        }
      } catch (error) {
        if (!cancelled && profileLoadGenerationRef.current === generation) {
          // 프로필 오류 화면이 이 문구와 ‘다시 시도’를 직접 보여 준다. 토스트로도 띄우면
          // 로그인한 뒤 앱 화면에서 지난 오류가 늦게 뜬다.
          const userMessage = toUserMessage(error)
          setProfileLoadError(userMessage)
          setProfile(null)
          setSessionWithoutProfile(false)
        }
      } finally {
        if (!cancelled && profileLoadGenerationRef.current === generation) {
          setInitialLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [profileEffectKey, profileRetryTick, resetSyncState, setData, setMessage])

  const retryProfileLoad = useCallback(() => {
    setProfileLoadError(null)
    setProfileRetryTick((value) => value + 1)
  }, [])

  // 로그아웃해도 임시저장한 검토요청은 지우지 않는다(사람별로 따로 저장된다). 다시 로그인하면 이어서 쓸 수 있다.
  // 화면별 검색어·필터(보기 상태)는 같은 탭을 다음 사람이 쓸 수 있으니 지운다.
  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
    clearViewState()
    setSessionUser(null)
    setProfile(previewEnabled ? demoLeader : null)
    setSessionWithoutProfile(false)
    setProfileInactive(false)
    resetSyncState()
    setData(previewEnabled ? createPreviewData() : emptyData)
    resetNavigation()
  }, [previewEnabled, resetNavigation, resetSyncState, setData])

  return {
    sessionUser,
    profile,
    setProfile,
    authReady,
    sessionWithoutProfile,
    profileInactive,
    profileLoadError,
    retryProfileLoad,
    initialLoading,
    signOut,
  }
}
