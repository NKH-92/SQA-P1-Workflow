import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createPreviewData, previewLeader as demoLeader } from '../../demoData'
import { clearReviewDraftStorage } from '../../features/reviews/useReviewDraft'
import { emptyData } from '../constants'
import { toUserMessage } from '../../lib/errors'
import { hasSupabaseConfig, isPreviewMode, supabase } from '../../lib/supabase'
import type { AppData, Profile } from '../../types'
import type { ToastMessage } from '../types'

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
  setMessage: React.Dispatch<React.SetStateAction<ToastMessage | null>>,
  resetNavigation: () => void,
) {
  const previewEnabled = isPreviewMode

  const [sessionUser, setSessionUser] = useState<User | null | undefined>(hasSupabaseConfig ? undefined : null)
  const [profile, setProfile] = useState<Profile | null>(previewEnabled ? demoLeader : null)
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig)
  const [sessionWithoutProfile, setSessionWithoutProfile] = useState(false)
  const [initialLoading, setInitialLoading] = useState(hasSupabaseConfig)
  const bootstrapDoneRef = useRef(false)

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
    }

    const timeoutId = window.setTimeout(() => {
      if (cancelled || bootstrapDoneRef.current) return
      void client.auth.signOut()
      completeBootstrap(null)
      setInitialLoading(false)
      setMessage({
        text: '저장된 로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.',
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
    if (!supabase || sessionUser === undefined) return

    if (!sessionUser) {
      setProfile(null)
      setSessionWithoutProfile(false)
      setData(emptyData)
      setInitialLoading(false)
      return
    }

    let cancelled = false
    void (async () => {
      setInitialLoading(true)
      try {
        const result = await loadProfileForSession()
        if (cancelled) return

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
          return
        }

        if (result.profile) {
          setProfile(result.profile)
          setSessionWithoutProfile(false)
          await refreshData({ initial: true })
        } else {
          setProfile(null)
          setSessionWithoutProfile(true)
        }
      } catch (error) {
        if (!cancelled) {
          setMessage({ text: toUserMessage(error), tone: 'error' })
          setProfile(null)
          setSessionWithoutProfile(false)
        }
      } finally {
        if (!cancelled) setInitialLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [sessionUser, refreshData, setData, setMessage])

  const signOut = useCallback(async () => {
    const profileId = profile?.id
    if (supabase) await supabase.auth.signOut()
    if (profileId) clearReviewDraftStorage(profileId)
    setSessionUser(null)
    setProfile(previewEnabled ? demoLeader : null)
    setSessionWithoutProfile(false)
    setData(previewEnabled ? createPreviewData() : emptyData)
    resetNavigation()
  }, [profile?.id, previewEnabled, resetNavigation, setData])

  return {
    sessionUser,
    profile,
    setProfile,
    authReady,
    sessionWithoutProfile,
    initialLoading,
    signOut,
  }
}
