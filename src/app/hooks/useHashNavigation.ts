import { useCallback, useEffect, useState } from 'react'
import {
  buildAppHash,
  forgetLatestEntityHash,
  isLatestEntityHash,
  isOverlayHistoryEntry,
  parseAppHash,
  replaceHashEntityId,
  sanitizeTabForRole,
  type NavigateOptions,
} from '../../lib/navigation'
import type { TabId } from '../types'

export function useHashNavigation(leaderMode: boolean, profileLoaded: boolean) {
  const initialHash = parseAppHash()
  const [activeTab, setActiveTabState] = useState<TabId>(initialHash.tab)
  const [navEntityId, setNavEntityId] = useState<string | null>(initialHash.entityId)

  // 모든 호출 경로를 역할 규칙으로 정규화한다. 사이드바/팔레트 외의 코드가 파트장 탭을
  // 직접 요청하더라도 멤버 화면이 잠시 빈 상태가 되거나 금지 해시가 남지 않는다.
  const setActiveTab = useCallback(
    (tab: TabId, entityId?: string, options?: NavigateOptions) => {
      const safeTab = sanitizeTabForRole(tab, leaderMode)
      const safeEntityId = safeTab === tab ? entityId : undefined
      setActiveTabState(safeTab)
      setNavEntityId(safeEntityId ?? null)
      forgetLatestEntityHash()
      const hash = buildAppHash(safeTab, safeEntityId)
      if (typeof window === 'undefined' || window.location.hash === hash) return
      // 서랍 메뉴·창·모바일 상세처럼 뒤로가기 기록을 이미 하나 쌓아 둔 곳에서 이동하면 그 기록을 바꿔 쓴다.
      // 새로 쌓으면 뒤로가기를 한 번 더 눌러야 이전 화면으로 돌아간다.
      if (options?.replace || isOverlayHistoryEntry()) window.history.replaceState(null, '', hash)
      else window.location.hash = hash
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
      // 창·상세 기록을 되돌리며 화면이 고른 항목을 다시 써 넣은 주소라면 이동이 아니다.
      if (isLatestEntityHash()) return
      forgetLatestEntityHash()
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

/**
 * 목록에서 고른 항목을 주소의 ?id=에 맞춰 둔다(기록은 쌓지 않는다). 다른 항목을 고른 뒤
 * 새로고침하거나 링크를 공유해도, 다른 메뉴에 다녀와 뒤로가기를 눌러도 같은 항목으로 돌아온다.
 * selectedId가 undefined면 아직 고르지 않은 것으로 보고 주소를 건드리지 않고, null이면 ?id=를 뺀다.
 *
 * 예: useSelectionHashSync('reviews', selectedReviewId)
 */
export function useSelectionHashSync(tab: TabId, selectedId: string | null | undefined, enabled = true) {
  useEffect(() => {
    if (!enabled || selectedId === undefined) return
    replaceHashEntityId(tab, selectedId)
  }, [enabled, selectedId, tab])
}
