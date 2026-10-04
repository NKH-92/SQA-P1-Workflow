import { useCallback, useState } from 'react'
import type { HomeMode } from '../../lib/homeMode'
import { readUiTheme, writeUiTheme, type UiTheme } from '../../lib/uiTheme'

export function useUiTheme(profileId: string | null, homeMode: HomeMode): { theme: UiTheme; explicit: boolean; setTheme(next: UiTheme): void } {
  const [chosen, setChosen] = useState<Record<string, UiTheme>>({})
  const stored = profileId ? chosen[profileId] ?? readUiTheme(profileId) : null
  const theme = stored ?? (homeMode === 'office' ? 'pixel' : 'classic')
  const setTheme = useCallback((next: UiTheme) => {
    if (!profileId) return
    writeUiTheme(profileId, next)
    setChosen((current) => ({ ...current, [profileId]: next }))
  }, [profileId])
  return { theme, explicit: stored != null, setTheme }
}
