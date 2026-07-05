import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createPreviewData, previewLeader as demoLeader, previewMember as demoMember } from './demoData'
import { emptyData } from './app/constants'
import type { TabId, ToastMessage } from './app/types'
import { canManageTeamData } from './domain/permissions'
import { fetchAppData } from './data/fetchAppData'
import { toUserMessage } from './lib/errors'
import { buildAppHash, isLeaderTab, parseAppHash, sanitizeTabForRole } from './lib/navigation'
import { countUnreadReviews, markReviewsSeen } from './lib/readState'
import { hasSupabaseConfig, supabase } from './lib/supabase'
import type { AppData, Profile } from './types'
import {
  ActivityPanel,
  AuthPanel,
  BlockedProfile,
  Dashboard,
  LeaderDashboard,
  LoadingScreen,
  MasterPanel,
  PasswordChangePanel,
  ProjectsPanel,
  ReviewsPanel,
  Shell,
  TeamPanel,
} from './screens'

async function loadProfileForUser(user: User): Promise<{ profile: Profile | null; inactive: boolean }> {
  if (!supabase) return { profile: null, inactive: false }
  const { data: profileRow, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (error) throw error
  if (!profileRow) return { profile: null, inactive: false }
  const profile = profileRow as Profile
  if (profile.is_active === false) return { profile: null, inactive: true }
  return { profile, inactive: false }
}

function App() {
  const initialHash = parseAppHash()
  const [activeTab, setActiveTabState] = useState<TabId>(initialHash.tab)
  const [navEntityId, setNavEntityId] = useState<string | null>(initialHash.entityId)
  const [sessionUser, setSessionUser] = useState<User | null | undefined>(hasSupabaseConfig ? undefined : null)
  const [profile, setProfile] = useState<Profile | null>(hasSupabaseConfig ? null : demoLeader)
  const [data, setData] = useState<AppData>(() => (hasSupabaseConfig ? emptyData : createPreviewData()))
  const [initialLoading, setInitialLoading] = useState(hasSupabaseConfig)
  const [refreshing, setRefreshing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<ToastMessage | null>(null)
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig)
  const [sessionWithoutProfile, setSessionWithoutProfile] = useState(false)
  const [readTick, setReadTick] = useState(0)

  const leaderMode = canManageTeamData(profile)
  const pendingCount = data.reviewRequests.filter((request) => request.status === 'pending').length
  const unreadReviewsCount = useMemo(() => {
    void readTick
    return profile ? countUnreadReviews(profile, data, leaderMode) : 0
  }, [profile, data, leaderMode, readTick])

  useEffect(() => {
    if (!profile || activeTab !== 'reviews') return
    markReviewsSeen(profile.id)
    setReadTick((value) => value + 1)
  }, [activeTab, profile])

  const setActiveTab = useCallback((tab: TabId, entityId?: string) => {
    setActiveTabState(tab)
    setNavEntityId(entityId ?? null)
    const hash = buildAppHash(tab, entityId)
    if (typeof window !== 'undefined' && window.location.hash !== hash) {
      window.location.hash = hash
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const syncFromHash = () => {
      const { tab, entityId } = parseAppHash()
      const safeTab = sanitizeTabForRole(tab, leaderMode)
      setActiveTabState(safeTab)
      setNavEntityId(entityId)
      if (safeTab !== tab) {
        const hash = buildAppHash(safeTab, entityId)
        if (window.location.hash !== hash) window.location.hash = hash
      }
    }
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [leaderMode])

  useEffect(() => {
    if (!profile) return
    const safeTab = sanitizeTabForRole(activeTab, leaderMode)
    if (safeTab !== activeTab) setActiveTab(safeTab)
  }, [activeTab, leaderMode, profile, setActiveTab])

  useEffect(() => {
    if (!profile || leaderMode) return
    if (isLeaderTab(activeTab)) setActiveTab('dashboard')
  }, [activeTab, leaderMode, profile, setActiveTab])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 3500)
    return () => clearTimeout(timer)
  }, [message])

  const refreshData = useCallback(async (options?: { initial?: boolean }) => {
    if (!supabase) return
    const isInitial = options?.initial ?? false
    if (isInitial) setInitialLoading(true)
    else setRefreshing(true)
    try {
      setData(await fetchAppData())
      setLastSyncedAt(new Date())
    } catch (error) {
      setMessage({ text: toUserMessage(error), tone: 'error' })
    } finally {
      if (isInitial) setInitialLoading(false)
      else setRefreshing(false)
    }
  }, [])

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
  }, [sessionUser, refreshData])

  const mutate = async (operation: () => Promise<void>, success: string) => {
    setSaving(true)
    setMessage(null)
    try {
      await operation()
      if (supabase) await refreshData()
      setMessage({ text: success, tone: 'success' })
    } catch (error) {
      setMessage({ text: toUserMessage(error), tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut()
    setSessionUser(null)
    setProfile(hasSupabaseConfig ? null : demoLeader)
    setSessionWithoutProfile(false)
    setData(hasSupabaseConfig ? emptyData : createPreviewData())
    setActiveTab('dashboard')
    if (typeof window !== 'undefined') window.location.hash = '#/dashboard'
  }

  if (!authReady || initialLoading || sessionUser === undefined) {
    return <LoadingScreen />
  }

  if (!profile && hasSupabaseConfig && sessionWithoutProfile) {
    return <BlockedProfile onSignOut={() => void signOut()} inactive />
  }

  if (!profile && hasSupabaseConfig) {
    return <AuthPanel />
  }

  if (!profile) {
    return <BlockedProfile />
  }

  if (profile.is_active === false) {
    return <BlockedProfile onSignOut={() => void signOut()} inactive />
  }

  if (hasSupabaseConfig && profile.must_change_password) {
    return (
      <PasswordChangePanel
        profile={profile}
        onComplete={(updatedProfile: Profile) => {
          setProfile(updatedProfile)
          setMessage({ text: '비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.', tone: 'success' })
          void refreshData()
        }}
        onSignOut={() => void signOut()}
      />
    )
  }

  return (
    <Shell
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      profile={profile}
      data={data}
      leaderMode={leaderMode}
      message={message}
      saving={saving}
      refreshing={refreshing}
      lastSyncedAt={lastSyncedAt}
      pendingCount={pendingCount}
      unreadReviewsCount={unreadReviewsCount}
      onRefresh={() => void refreshData()}
      onSignOut={() => void signOut()}
      onPreviewRoleChange={
        hasSupabaseConfig
          ? undefined
          : (role) => {
              setProfile(role === 'leader' ? demoLeader : demoMember)
              setActiveTab('dashboard')
            }
      }
    >
      {(activeTab === 'dashboard' || activeTab === 'work') &&
        (leaderMode && activeTab === 'dashboard' ? (
          <LeaderDashboard profile={profile} data={data} setActiveTab={setActiveTab} />
        ) : !leaderMode ? (
          <Dashboard profile={profile} data={data} mutate={mutate} setData={setData} setActiveTab={setActiveTab} />
        ) : null)}
      {activeTab === 'reviews' && (
        <ReviewsPanel
          profile={profile}
          data={data}
          mutate={mutate}
          setData={setData}
          initialSelectedId={navEntityId}
          onInitialSelectionApplied={() => setNavEntityId(null)}
        />
      )}
      {activeTab === 'projects' && <ProjectsPanel profile={profile} data={data} mutate={mutate} setData={setData} />}
      {activeTab === 'team' && leaderMode && (
        <TeamPanel profile={profile} data={data} mutate={mutate} setData={setData} setActiveTab={setActiveTab} />
      )}
      {(activeTab === 'products' || activeTab === 'duties' || activeTab === 'invites') && leaderMode && (
        <MasterPanel
          profile={profile}
          data={data}
          mutate={mutate}
          setData={setData}
          masterView={activeTab}
          setActiveTab={setActiveTab}
        />
      )}
      {activeTab === 'activity' && leaderMode && <ActivityPanel data={data} />}
    </Shell>
  )
}

export default App
