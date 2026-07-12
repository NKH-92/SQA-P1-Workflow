import type { TabId } from './types'

export function shouldMarkReviewsSeen(activeTab: TabId, nextTab: TabId) {
  return activeTab === 'reviews' && nextTab === 'reviews'
}
