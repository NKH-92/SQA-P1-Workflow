import type { Dispatch, SetStateAction } from 'react'
import type { MutateFn } from '../../../app/types'
import type { AppData, Profile } from '../../../types'

export type MasterSubPanelProps = {
  profile: Profile
  data: AppData
  mutate: MutateFn
  setData: Dispatch<SetStateAction<AppData>>
}
