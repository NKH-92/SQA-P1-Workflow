import { useCallback, useEffect, useRef, useState } from 'react'
import { isAuthApiError, isAuthSessionMissingError, type User } from '@supabase/supabase-js'
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

/** 세션 자체가 더는 쓸 수 없다는 뜻의 getUser() 오류인지 확인한다(세션 없음, 401/403/404). */
function isInvalidSessionError(error: unknown) {
  if (isAuthSessionMissingError(error)) return true
  return isAuthApiError(error) && [401, 403, 404].includes(error.status)
}

async function loadProfileForSession(): Promise<{ profile: Profile | null; inactive: boolean; invalidSession: boolean }> {
  if (!supabase) return { profile: null, inactive: false, invalidSession: false }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    // 세션이 없거나 서버가 거부한 경우만 로그아웃으로 정리한다. 네트워크·5xx 같은 일시 오류는
    // 프로필 오류 화면(다시 시도)으로 넘겨 멀쩡한 세션을 버리지 않는다.
    if (!userError || isInvalidSessionError(userError)) {
      return { profile: null, inactive: false, invalidSession: true }
    }
    throw userError
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
  /** 사용자가 닫을 때까지 남기는 안내(임시 비밀번호 등)까지 모두 지운다. 로그아웃·사용자 교체 때 부른다. */
  clearAllToasts: () => void = () => {},
) {
  const previewEnabled = isPreviewMode
  // 매 렌더 새 함수가 와도 효과를 다시 돌리지 않도록 ref로 최신 값을 읽는다.
  const clearAllToastsRef = useRef(clearAllToasts)
  useEffect(() => {
    clearAllToastsRef.current = clearAllToasts
  })
  /** 마지막으로 본 로그인 주체. 바뀌면 앞사람에게 남긴 안내를 지운다. */
  const lastSessionKeyRef = useRef<string | null>(null)

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
      void client.auth.signOut({ scope: 'local' })
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
      // 포커스·토큰 갱신마다 새 객체가 와도 같은 사람이면 이전 참조를 유지해 App 전체가 다시 그려지지 않게 한다.
      // 앱은 sessionUser의 id와 undefined 여부만 쓴다.
      setSessionUser((prev) => (prev && user && prev.id === user.id ? prev : user))

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
        void client.auth.signOut({ scope: 'local' })
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

    // 로그인한 사람이 바뀌면(다른 탭의 로그아웃·세션 만료 포함) 앞사람의 계정 안내가 남지 않게 모두 지운다.
    if (lastSessionKeyRef.current !== null && lastSessionKeyRef.current !== profileEffectKey) {
      clearAllToastsRef.current()
    }
    lastSessionKeyRef.current = profileEffectKey

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
          await supabase.auth.signOut({ scope: 'local' })
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
    if (supabase) await supabase.auth.signOut({ scope: 'local' })
    clearViewState()
    // 같은 탭을 다음 사람이 쓸 수 있으니 임시 비밀번호 같은 안내도 남기지 않는다.
    clearAllToastsRef.current()
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
