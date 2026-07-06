import type { Dispatch, SetStateAction } from 'react'
import type { AppData, Profile } from '../types'
import type { MasterTabId, TabId } from '../app/types'
import { DutyMasterPanel } from '../features/master/duties/DutyMasterPanel'
import { InviteMasterPanel } from '../features/master/invites/InviteMasterPanel'
import { ProductMasterPanel } from '../features/master/products/ProductMasterPanel'

export function MasterPanel({
  profile,
  data,
  mutate,
  setData,
  masterView,
  setActiveTab,
}: {
  profile: Profile
  data: AppData
  mutate: (operation: () => Promise<void>, success: string) => Promise<void>
  setData: Dispatch<SetStateAction<AppData>>
  masterView: MasterTabId
  setActiveTab: (tab: TabId, entityId?: string) => void
}) {
  const common = { profile, data, mutate, setData, setActiveTab }

  if (masterView === 'products') return <ProductMasterPanel {...common} />
  if (masterView === 'duties') return <DutyMasterPanel {...common} />
  return <InviteMasterPanel {...common} />
}
