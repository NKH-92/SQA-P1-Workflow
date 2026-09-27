import { useMemo, type ReactNode } from 'react'
import type { OfficeLayout } from '../../../types'
import { PixelUiContext } from '../pixelUiContext'

/** 앱 전체에 도트 디자인 여부와 사무실 자리 배치(캐릭터 얼굴을 찾는 곳)를 알린다. */
export function PixelUiProvider({
  enabled,
  layout,
  children,
}: {
  enabled: boolean
  layout: OfficeLayout | undefined
  children: ReactNode
}) {
  const value = useMemo(() => ({ enabled, layout }), [enabled, layout])
  return <PixelUiContext.Provider value={value}>{children}</PixelUiContext.Provider>
}
