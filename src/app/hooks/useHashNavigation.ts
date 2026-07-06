import { useCallback, useEffect, useState } from 'react'
import { buildAppHash, isLeaderTab, parseAppHash, sanitizeTabForRole } from '../../lib/navigation'
import type { TabId } from '../types'

export function useHashNavigation(leaderMode: boolean, profileLoaded: boolean) {
  const initialHash = parseAppHash()
  const [activeTab, setActiveTabState] = useState<TabId>(initialHash.tab)
  const [navEntityId, setNavEntityId] = useState<string | null>(initialHash.entityId)

  const setActiveTab = useCallback((tab: TabId, entityId?: string) => {
    setActiveTabState(tab)
    setNavEntityId(entityId ?? null)
    const hash = buildAppHash(tab, entityId)
    if (typeof window !== 'undefined' && window.location.hash !== hash) {
      window.location.hash = hash
    }
  }, [])

  const resetNavigation = useCallback(() => {
    setActiveTab('dashboard')
    if (typeof window !== 'undefined') window.location.hash = '#/dashboard'
  }, [setActiveTab])

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
    if (!profileLoaded) return
    const safeTab = sanitizeTabForRole(activeTab, leaderMode)
    if (safeTab !== activeTab) setActiveTab(safeTab)
  }, [activeTab, leaderMode, profileLoaded, setActiveTab])

  useEffect(() => {
    if (!profileLoaded || leaderMode) return
    if (isLeaderTab(activeTab)) setActiveTab('dashboard')
  }, [activeTab, leaderMode, profileLoaded, setActiveTab])

  return { activeTab, navEntityId, setActiveTab, setNavEntityId, resetNavigation }
}
