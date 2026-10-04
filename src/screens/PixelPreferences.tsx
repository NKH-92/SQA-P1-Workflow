import { useState } from 'react'
import { LayoutGrid, ListChecks } from 'lucide-react'
import { morningBriefEnabled, setMorningBriefEnabled } from '../lib/morningBrief'
import type { UiTheme } from '../lib/uiTheme'
export function PixelPreferences({ profileId, readOnly, uiTheme, onToggleUiTheme }: { profileId: string; readOnly: boolean; uiTheme: UiTheme; onToggleUiTheme?: () => void }) {
  const [choices, setChoices] = useState<Record<string, boolean>>({})
  const enabled = choices[profileId] ?? morningBriefEnabled(profileId)
  return <>
    {onToggleUiTheme && <button aria-pressed={uiTheme === 'pixel'} className="sidebar-footer-button theme-toggle" onClick={onToggleUiTheme} type="button"><LayoutGrid aria-hidden="true" size={15} /> 도트 화면</button>}
    {!readOnly && <button aria-pressed={enabled} className="sidebar-footer-button" type="button" onClick={() => {
      setMorningBriefEnabled(profileId, !enabled)
      setChoices(current => ({ ...current, [profileId]: !enabled }))
    }}><ListChecks aria-hidden="true" size={15} /> 아침 조회</button>}
  </>
}
