import { useEffect, useMemo, useRef, useState } from 'react'
import { AppRoutes, usePreviewRoleChange } from './app/AppRoutes'
import { useAppData } from './app/hooks/useAppData'
import { useAuthProfile } from './app/hooks/useAuthProfile'
import { useHashNavigation } from './app/hooks/useHashNavigation'
import { useMutationRunner } from './app/hooks/useMutationRunner'
import { canManageTeamData } from './domain/permissions'
import { countUnreadReviews, markReviewsSeen } from './lib/readState'
import { hasSupabaseConfig, isPreviewMode } from './lib/supabase'
import type { Profile } from './types'
import { AuthPanel, BlockedProfile, ConfigErrorScreen, LoadingScreen, PasswordChangePanel, Shell } from './screens'

function App() {
  const [readTick, setReadTick] = useState(0)
  const reportWarningsRef = useRef<(warnings: string[]) => void>(() => {})
  const { data, setData, refreshing, lastSyncedAt, refreshData } = useAppData((warnings) =>
    reportWarningsRef.current(warnings),
  )
  const { saving, message, setMessage, mutate } = useMutationRunner(refreshData)
  useEffect(() => {
    reportWarningsRef.current = (warnings) => setMessage({ text: warnings.join(' '), tone: 'warning' })
  }, [setMessage])
  const auth = useAuthProfile(refreshData, setData, setMessage, () => {})
  const { profile, setProfile, authReady, sessionWithoutProfile, initialLoading, sessionUser, signOut } = auth
  const leaderMode = canManageTeamData(profile)
  const navigation = useHashNavigation(leaderMode, Boolean(profile))
  const previewRoleChange = usePreviewRoleChange(setProfile, navigation.setActiveTab)

  const pendingCount = data.reviewRequests.filter((request) => request.status === 'pending').length
  const unreadReviewsCount = useMemo(() => {
    void readTick
    return profile ? countUnreadReviews(profile, data, leaderMode) : 0
  }, [profile, data, leaderMode, readTick])

  useEffect(() => {
    if (!profile || navigation.activeTab !== 'reviews') return
    markReviewsSeen(profile.id)
    setReadTick((value) => value + 1)
  }, [navigation.activeTab, profile])

  const handleSignOut = async () => {
    await signOut()
    navigation.setActiveTab('dashboard')
    if (typeof window !== 'undefined') window.location.hash = '#/dashboard'
  }

  if (!authReady || initialLoading || sessionUser === undefined) {
    return <LoadingScreen />
  }

  if (!hasSupabaseConfig && !isPreviewMode) {
    return <ConfigErrorScreen />
  }

  if (!profile && hasSupabaseConfig && sessionWithoutProfile) {
    return <BlockedProfile onSignOut={() => void handleSignOut()} inactive />
  }

  if (!profile && hasSupabaseConfig) {
    return <AuthPanel />
  }

  if (!profile) {
    return <ConfigErrorScreen />
  }

  if (profile.is_active === false) {
    return <BlockedProfile onSignOut={() => void handleSignOut()} inactive />
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
        onSignOut={() => void handleSignOut()}
      />
    )
  }

  return (
    <Shell
      activeTab={navigation.activeTab}
      setActiveTab={navigation.setActiveTab}
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
      onSignOut={() => void handleSignOut()}
      onPreviewRoleChange={previewRoleChange}
    >
      <AppRoutes
        activeTab={navigation.activeTab}
        navEntityId={navigation.navEntityId}
        setNavEntityId={navigation.setNavEntityId}
        profile={profile}
        data={data}
        mutate={mutate}
        setData={setData}
        setActiveTab={navigation.setActiveTab}
        setProfile={setProfile}
        setMessage={setMessage}
        refreshData={refreshData}
      />
    </Shell>
  )
}

export default App
