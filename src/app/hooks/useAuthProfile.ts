import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createPreviewData, previewLeader as demoLeader } from '../../demoData'
import { clearReviewDraftStorage } from '../../features/reviews/useReviewDraft'
import { emptyData } from '../constants'
import { toUserMessage } from '../../lib/errors'
import { hasSupabaseConfig, isPreviewMode, supabase } from '../../lib/supabase'
import type { AppData, Profile } from '../../types'
import type { ToastMessage } from '../types'

async function loadProfileForUser(user: User): Promise<{ profile: Profile | null; inactive: boolean }> {
  if (!supabase) return { profile: null, inactive: false }
  const { data: profileRow, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (error) throw error
  if (!profileRow) return { profile: null, inactive: false }
  const profile = profileRow as Profile
  if (profile.is_active === false) return { profile: null, inactive: true }
  return { profile, inactive: false }
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

  useEffect(() => {
    const client = supabase
    if (!client) return

    let active = true
    void client.auth.getSession().then(({ data: sessionData }) => {
      if (!active) return
      setSessionUser(sessionData.session?.user ?? null)
      setAuthReady(true)
    })

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

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
        const result = await loadProfileForUser(sessionUser)
        if (cancelled) return
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
