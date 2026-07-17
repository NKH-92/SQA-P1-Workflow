import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { selectScopedReviewRequests } from '../../features/reviews/review.selectors'
import { toUserMessage } from '../../lib/errors'
import type { AppData, Profile } from '../../types'
import type { TabId, ToastMessage } from '../types'

type EntityLoader = (entityId: string, signal: AbortSignal) => Promise<boolean | null>

export type DeepLinkEntityOptions = {
  entityId: string | null
  activeTab: TabId
  data: AppData
  profile: Profile | null
  dataReady: boolean
  setEntityId: (entityId: string | null) => void
  loadReviewRequest: EntityLoader
  loadAnnouncement: EntityLoader
  setMessage: Dispatch<SetStateAction<ToastMessage | null>>
}

function hasDeepLinkEntity(
  activeTab: TabId,
  entityId: string,
  data: AppData,
  profile: Profile,
) {
  if (activeTab === 'reviews') {
    return selectScopedReviewRequests(data, profile).some((request) => request.id === entityId)
  }
  if (activeTab === 'announcements') {
    return data.announcements.some((announcement) => announcement.id === entityId)
  }
  if (activeTab === 'change-applications') {
    return data.changeApplications.some((application) => application.id === entityId)
  }
  if (activeTab === 'projects') {
    return data.projects.some((project) => project.id === entityId)
  }
  if (activeTab === 'team') {
    return data.profiles.some((item) => item.id === entityId)
  }
  return true
}

/**
 * Resolves deep links that point outside capped review/announcement queries.
 * The lookup and abort semantics intentionally mirror the original App effect.
 */
export function useDeepLinkEntity({
  entityId,
  activeTab,
  data,
  profile,
  dataReady,
  setEntityId,
  loadReviewRequest,
  loadAnnouncement,
  setMessage,
}: DeepLinkEntityOptions) {
  const lookupRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!entityId) {
      abortRef.current?.abort()
      abortRef.current = null
      lookupRef.current = null
      return
    }
    if (!profile || !dataReady) {
      abortRef.current?.abort()
      abortRef.current = null
      lookupRef.current = null
      return
    }
    if (hasDeepLinkEntity(activeTab, entityId, data, profile)) {
      abortRef.current?.abort()
      abortRef.current = null
      lookupRef.current = null
      return
    }
    if (activeTab === 'reviews' || activeTab === 'announcements') {
      const lookupKey = `${activeTab}:${entityId}`
      if (lookupRef.current === lookupKey) return
      abortRef.current?.abort()
      const abortController = new AbortController()
      abortRef.current = abortController
      lookupRef.current = lookupKey
      const loadEntity = activeTab === 'reviews' ? loadReviewRequest : loadAnnouncement
      void loadEntity(entityId, abortController.signal)
        .then((loaded) => {
          if (lookupRef.current !== lookupKey) return
          if (loaded === null) {
            lookupRef.current = null
            return
          }
          if (loaded) return
          setEntityId(null)
          setMessage({ text: '링크 대상을 찾을 수 없습니다. 삭제되었거나 접근 권한이 없는 항목일 수 있습니다.', tone: 'warning' })
        })
        .catch((error) => {
          if (lookupRef.current !== lookupKey) return
          lookupRef.current = null
          setMessage({ text: toUserMessage(error), tone: 'warning' })
        })
      return
    }
    abortRef.current?.abort()
    abortRef.current = null
    lookupRef.current = null
    setEntityId(null)
    setMessage({ text: '링크 대상을 찾을 수 없습니다. 삭제되었거나 접근 권한이 없는 항목일 수 있습니다.', tone: 'warning' })
  }, [
    entityId,
    activeTab,
    setEntityId,
    data,
    profile,
    dataReady,
    loadReviewRequest,
    loadAnnouncement,
    setMessage,
  ])
}
