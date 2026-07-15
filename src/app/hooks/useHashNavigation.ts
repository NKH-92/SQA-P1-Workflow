import { useCallback, useEffect, useState } from 'react'
import { buildAppHash, parseAppHash, sanitizeTabForRole } from '../../lib/navigation'
import type { TabId } from '../types'

export function useHashNavigation(leaderMode: boolean, profileLoaded: boolean) {
  const initialHash = parseAppHash()
  const [activeTab, setActiveTabState] = useState<TabId>(initialHash.tab)
  const [navEntityId, setNavEntityId] = useState<string | null>(initialHash.entityId)

  // 모든 호출 경로를 역할 규칙으로 정규화한다. 사이드바/팔레트 외의 코드가 파트장 탭을
  // 직접 요청하더라도 멤버 화면이 잠시 빈 상태가 되거나 금지 해시가 남지 않는다.
  const setActiveTab = useCallback(
    (tab: TabId, entityId?: string) => {
      const safeTab = sanitizeTabForRole(tab, leaderMode)
      const safeEntityId = safeTab === tab ? entityId : undefined
      setActiveTabState(safeTab)
      setNavEntityId(safeEntityId ?? null)
      const hash = buildAppHash(safeTab, safeEntityId)
      if (typeof window !== 'undefined' && window.location.hash !== hash) {
        window.location.hash = hash
      }
    },
    [leaderMode],
  )

  const replaceActiveTab = useCallback((tab: TabId, entityId?: string | null) => {
    setActiveTabState(tab)
    setNavEntityId(entityId ?? null)
    if (typeof window === 'undefined') return
    const hash = buildAppHash(tab, entityId)
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash)
  }, [])

  const resetNavigation = useCallback(() => {
    setActiveTab('dashboard')
  }, [setActiveTab])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const syncFromHash = () => {
      const { tab, entityId } = parseAppHash()
      const safeTab = sanitizeTabForRole(tab, leaderMode)
      const safeEntityId = safeTab === tab ? entityId : null
      setActiveTabState(safeTab)
      setNavEntityId(safeEntityId)
      if (safeTab !== tab) {
        const hash = buildAppHash(safeTab, safeEntityId)
        if (window.location.hash !== hash) window.history.replaceState(null, '', hash)
      }
    }
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [leaderMode])

  useEffect(() => {
    if (!profileLoaded) return
    const safeTab = sanitizeTabForRole(activeTab, leaderMode)
    if (safeTab !== activeTab) replaceActiveTab(safeTab)
  }, [activeTab, leaderMode, profileLoaded, replaceActiveTab])

  // 프로필이 막 로드되거나 역할이 바뀐 렌더에서도 금지 탭을 노출하지 않는다.
  // effect가 주소를 정규화하기 전 한 프레임 동안 Shell 제목이 보이는 것까지 차단한다.
  const exposedActiveTab = profileLoaded ? sanitizeTabForRole(activeTab, leaderMode) : activeTab
  const exposedNavEntityId = exposedActiveTab === activeTab ? navEntityId : null

  return {
    activeTab: exposedActiveTab,
    navEntityId: exposedNavEntityId,
    setActiveTab,
    setNavEntityId,
    resetNavigation,
  }
}
