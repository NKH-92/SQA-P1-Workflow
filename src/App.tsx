import { useEffect, useMemo, useRef, useState } from 'react'
import { AppRoutes, usePreviewRoleChange } from './app/AppRoutes'
import { useAppData } from './app/hooks/useAppData'
import { useAuthProfile } from './app/hooks/useAuthProfile'
import { useHashNavigation } from './app/hooks/useHashNavigation'
import { useMutationRunner } from './app/hooks/useMutationRunner'
import { CommandPalette } from './components/CommandPalette'
import { canManageTeamData } from './domain/permissions'
import { toUserMessage } from './lib/errors'
import { buildNotifications } from './lib/notifications'
import { countUnreadReviews, loadReadState, markReviewsSeen } from './lib/readState'
import { hasSupabaseConfig, isPreviewMode } from './lib/supabase'
import type { Profile } from './types'
import { AuthPanel, BlockedProfile, ConfigErrorScreen, LoadingScreen, PasswordChangePanel, Shell } from './screens'

function App() {
  const [readTick, setReadTick] = useState(0)
  // 검토 리스트의 미확인 dot 기준점. 탭 진입 시 '이전' seenAt을 캡처하고,
  // '모두 읽음'을 누르면 즉시 현재 시각으로 당겨 dot과 뱃지가 함께 꺼지게 한다.
  const [reviewsUnreadCutoff, setReviewsUnreadCutoff] = useState<string | null>(null)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const reportWarningsRef = useRef<(warnings: string[]) => void>(() => {})
  const { data, setData, refreshing, lastSyncedAt, refreshData } = useAppData((warnings) =>
    reportWarningsRef.current(warnings),
  )
  const { saving, message, setMessage, mutate } = useMutationRunner(refreshData)
  useEffect(() => {
    reportWarningsRef.current = (warnings) => setMessage({ text: warnings.join(' '), tone: 'warning' })
  }, [setMessage])
  const resetNavigationRef = useRef<() => void>(() => {})
  const auth = useAuthProfile(refreshData, setData, setMessage, () => resetNavigationRef.current())
  const { profile, setProfile, authReady, sessionWithoutProfile, initialLoading, sessionUser, signOut } = auth
  const leaderMode = canManageTeamData(profile)
  const navigation = useHashNavigation(leaderMode, Boolean(profile))
  useEffect(() => {
    resetNavigationRef.current = navigation.resetNavigation
  }, [navigation.resetNavigation])
  const previewRoleChange = usePreviewRoleChange(setProfile, navigation.setActiveTab)

  const pendingCount = data.reviewRequests.filter((request) => request.status === 'pending').length
  const unreadReviewsCount = useMemo(() => {
    void readTick
    return profile ? countUnreadReviews(profile, data, leaderMode) : 0
  }, [profile, data, leaderMode, readTick])

  const notifications = useMemo(() => {
    void readTick
    return profile ? buildNotifications(profile, data, leaderMode) : []
  }, [profile, data, leaderMode, readTick])

  useEffect(() => {
    if (!profile || navigation.activeTab !== 'reviews') return
    // markReviewsSeen보다 먼저 캡처해야 dot 기준점이 '이번 방문 이전'이 된다.
    setReviewsUnreadCutoff(loadReadState(profile.id).reviewsSeenAt)
    markReviewsSeen(profile.id)
    setReadTick((value) => value + 1)
  }, [navigation.activeTab, profile])

  // 팔레트는 인증 완료 후 메인 화면에서만 렌더된다. 로그인·비밀번호 변경 화면에서
  // 단축키를 받으면 브라우저 기본 동작만 뺏고 열림 상태가 뒤에서 토글되어,
  // 로그인 직후 팔레트가 저절로 열린 채 시작된다.
  const commandPaletteAvailable =
    authReady &&
    !initialLoading &&
    sessionUser !== undefined &&
    Boolean(profile) &&
    profile?.is_active !== false &&
    !(hasSupabaseConfig && profile?.must_change_password)

  // Cmd/Ctrl+K 로 빠른 이동 팔레트를 연다. 입력 중에도 열리도록 target을 가리지 않는다.
  useEffect(() => {
    if (!commandPaletteAvailable) {
      setCommandPaletteOpen(false)
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commandPaletteAvailable])

  const markAllNotificationsRead = () => {
    if (!profile) return
    markReviewsSeen(profile.id)
    setReviewsUnreadCutoff(new Date().toISOString())
    setReadTick((value) => value + 1)
  }

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
          // 변경 전 초기 로드는 RLS가 막아 빈 데이터였으므로 이 refresh가 유일한 로드 경로다.
          // 실패를 삼키면 성공 토스트와 빈 대시보드만 남는다.
          refreshData().catch((error) => setMessage({ text: toUserMessage(error), tone: 'error' }))
        }}
        onSignOut={() => void handleSignOut()}
      />
    )
  }

  return (
    <>
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
        notifications={notifications}
        onMarkAllRead={markAllNotificationsRead}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onRefresh={() => {
          refreshData().catch((error) => setMessage({ text: toUserMessage(error), tone: 'error' }))
        }}
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
          reviewsUnreadCutoff={reviewsUnreadCutoff}
        />
      </Shell>
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        profile={profile}
        data={data}
        leaderMode={leaderMode}
        setActiveTab={navigation.setActiveTab}
      />
    </>
  )
}

export default App
