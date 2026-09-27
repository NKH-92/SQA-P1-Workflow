import { createContext, useContext } from 'react'
import type { OfficeLayout } from '../../types'

/**
 * 도트 디자인을 쓰는지(홈을 전체 화면 사무실로 쓰는 사람)와, 캐릭터 얼굴을 찾을 사무실 자리 배치.
 * 기존 화면을 고른 사람에게는 enabled가 false라 업무 화면이 예전 디자인 그대로 보인다.
 * 첫 화면 번들을 가볍게 두려고 여기서는 값만 나르고, 얼굴 도트는 쓰는 화면(PersonFace)에서 만든다.
 */
export type PixelUi = {
  enabled: boolean
  layout: OfficeLayout | undefined
}

export const PixelUiContext = createContext<PixelUi>({ enabled: false, layout: undefined })

export function usePixelUi(): PixelUi {
  return useContext(PixelUiContext)
}
