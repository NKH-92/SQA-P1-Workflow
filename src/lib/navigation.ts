export type AppTabId =
  | 'dashboard'
  | 'reviews'
  | 'projects'
  | 'team'
  | 'products'
  | 'duties'
  | 'invites'
  | 'work'
  | 'activity'

const VALID_TABS: AppTabId[] = ['dashboard', 'reviews', 'projects', 'team', 'products', 'duties', 'invites', 'work', 'activity']

export function parseAppHash(hash = typeof window !== 'undefined' ? window.location.hash : '') {
  const raw = hash.replace(/^#\/?/, '')
  if (!raw) return { tab: 'dashboard' as AppTabId, entityId: null as string | null }
  const [tabPart, query = ''] = raw.split('?')
  const tab = VALID_TABS.includes(tabPart as AppTabId) ? (tabPart as AppTabId) : 'dashboard'
  const entityId = new URLSearchParams(query).get('id')
  return { tab, entityId }
}

export function buildAppHash(tab: AppTabId, entityId?: string | null) {
  if (entityId) return `#/${tab}?id=${encodeURIComponent(entityId)}`
  return `#/${tab}`
}

export function isLeaderTab(tab: AppTabId) {
  return tab === 'team' || tab === 'products' || tab === 'duties' || tab === 'invites' || tab === 'activity'
}

export function sanitizeTabForRole(tab: AppTabId, leaderMode: boolean): AppTabId {
  if (leaderMode && tab === 'work') return 'dashboard'
  if (!leaderMode && isLeaderTab(tab)) return 'dashboard'
  return tab
}
