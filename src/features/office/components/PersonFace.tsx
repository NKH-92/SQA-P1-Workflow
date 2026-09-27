import type { ReactNode } from 'react'
import { faceGrid, lookForPerson } from '../pixelFace'
import { usePixelUi } from '../pixelUiContext'
import { PixelArt } from './PixelArt'

export type PersonFaceSize = 'xs' | 'sm' | 'md' | 'lg'

/**
 * 사람 이름 옆에 붙이는 도트 얼굴. 사무실에 앉은 사람은 그 캐릭터 얼굴을, 아니면 이름 첫 글자 명패를 보여 준다.
 * 도트 디자인을 쓰지 않는 사람(기존 화면)에게는 fallback(예전 아이콘)을 그대로 그린다. 이름은 늘 옆 글자로 읽히므로 장식이다.
 */
export function PersonFace({
  profileId,
  name,
  size = 'sm',
  className,
  fallback = null,
}: {
  profileId?: string | null
  name?: string | null
  size?: PersonFaceSize
  className?: string
  /** 기존 디자인에서 이 자리에 보이던 것(아이콘·머리글자 등) */
  fallback?: ReactNode
}) {
  const pixel = usePixelUi()
  if (!pixel.enabled) return <>{fallback}</>
  const look = lookForPerson(pixel.layout, profileId, name)
  const classes = ['person-face', className].filter(Boolean).join(' ')
  if (!look) {
    return (
      <span aria-hidden="true" className={`${classes} person-face-plate`} data-size={size}>
        {name?.trim().charAt(0) || '?'}
      </span>
    )
  }
  return (
    <span aria-hidden="true" className={classes} data-size={size}>
      <PixelArt grid={faceGrid(look)} />
    </span>
  )
}
