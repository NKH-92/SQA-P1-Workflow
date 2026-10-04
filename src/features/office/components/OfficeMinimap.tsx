import { useEffect, useRef } from 'react'
import type { AppData, Profile } from '../../../types'
import type { TabId } from '../../../app/types'
import { worldStill } from '../officeVignette'
import { WORLD_LEFT, WORLD_TOP, WORLD_WIDTH, WORLD_HEIGHT } from '../officeGeometry'
import { SCENE_HOTSPOTS } from '../officeScene'
import { HOTSPOT_TABS, hotspotsForViewer, isTabHotspot } from '../officeNavigation'
import { buildOfficeAlerts } from '../officeAlerts'
import { fromOffice } from '../../../app/routeLoading'
/** Pointer shortcut only. The adjacent native navigation remains the accessible equivalent. */
export function OfficeMinimap({ profile, data, activeTab, navigate }: { profile: Profile; data: AppData; activeTab: TabId; navigate(tab: TabId): void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const allowed = hotspotsForViewer(SCENE_HOTSPOTS.map(h => h.id), profile)
  const areas = SCENE_HOTSPOTS.filter(h => isTabHotspot(h.id) && allowed.includes(h.id))
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    const world = worldStill()
    if (!ctx || !world) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, 440, 248)
    ctx.drawImage(world, 0, 0, 440, 248)
    const alerts = buildOfficeAlerts(profile, data)
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--brand-yellow').trim()
    ctx.fillStyle = ctx.strokeStyle
    ctx.lineWidth = 3
    for (const area of areas) {
      const x = (area.x - WORLD_LEFT) * 440 / WORLD_WIDTH, y = (area.y - WORLD_TOP) * 248 / WORLD_HEIGHT
      if (isTabHotspot(area.id) && HOTSPOT_TABS[area.id] === activeTab) ctx.strokeRect(x, y, area.w * 440 / WORLD_WIDTH, area.h * 248 / WORLD_HEIGHT)
      if (alerts[area.id]) ctx.fillRect(x, y, 5, 5)
    }
  }, [activeTab, data, profile, areas])
  return <canvas aria-hidden="true" className="office-minimap" ref={canvas} width={440} height={248} onClick={event => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width * WORLD_WIDTH + WORLD_LEFT
    const y = (event.clientY - rect.top) / rect.height * WORLD_HEIGHT + WORLD_TOP
    const area = areas.find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h)
    if (area && isTabHotspot(area.id)) { const tab = HOTSPOT_TABS[area.id]; fromOffice(tab, () => navigate(tab)) }
  }} />
}
