import { useEffect, useMemo, useRef } from 'react'
import type { OfficeLook } from '../officeCharacter'
import { lookForPerson } from '../pixelFace'
import { usePixelUi } from '../pixelUiContext'
import { paintVignette, type VignettePlace } from '../officeVignette'

export type OfficePlacePerson = { profileId?: string | null; name?: string | null }

/** 화면 크기(CSS px)는 논리 픽셀 두 배로 고정한다(88×50 → 176×100). */
const CSS_SCALE = 2

/**
 * 업무 화면 머리말 왼쪽의 도트 장소 그림(사무실의 그 기물 앞에 내가 서 있는 모습).
 * 도트 디자인을 쓰는 사람에게만 보이고, 장식이라 보조기기에는 숨긴다.
 */
export function OfficePlace({ place, people }: { place: VignettePlace; people: readonly OfficePlacePerson[] }) {
  const pixel = usePixelUi()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 부모가 매번 새 배열을 넘겨도 사람이 바뀔 때만 다시 그린다.
  const peopleKey = people.map((person) => `${person.profileId ?? ''}:${person.name ?? ''}`).join('|')
  const looks = useMemo(() => {
    const seen = new Set<OfficeLook>()
    const result: OfficeLook[] = []
    for (const entry of peopleKey.split('|')) {
      if (!entry) continue
      const [profileId, ...name] = entry.split(':')
      const person = { profileId: profileId || null, name: name.join(':') || null }
      const look = lookForPerson(pixel.layout, person.profileId, person.name)
      if (look && !seen.has(look)) {
        seen.add(look)
        result.push(look)
      }
    }
    return result
  }, [peopleKey, pixel.layout])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!pixel.enabled || !canvas) return
    const scale = Math.max(CSS_SCALE, Math.round(CSS_SCALE * (window.devicePixelRatio || 1)))
    paintVignette(canvas, place, looks, scale)
  }, [looks, pixel.enabled, place])

  if (!pixel.enabled) return null
  return (
    <span aria-hidden="true" className="office-place" data-place={place}>
      <canvas ref={canvasRef} />
    </span>
  )
}
