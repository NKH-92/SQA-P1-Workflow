import type { AppData } from '../../types'

export type AppDataUpdate = AppData | ((current: AppData) => AppData)
export type AppDataUpdater = (update: AppDataUpdate) => void
