import type { AppData } from '../types'
import { createEmptyAppData } from '../data/appData'

export const PASSWORD_MIN_LENGTH = 8

/** @deprecated 새 상태에는 createEmptyAppData()를 사용한다. */
export const emptyData: AppData = createEmptyAppData()
export { createEmptyAppData }
