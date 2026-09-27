import { useEffect, useRef } from 'react'
import { paintGrid } from '../officeCanvas'
import type { OfficeLook } from '../officeCharacter'
import { composePortrait, SPRITE_HEIGHT, SPRITE_WIDTH } from '../officeSprites'

/** 자리 배치 창의 캐릭터 미리보기(앉은 상반신 한 장). */
export function OfficePortrait({ look }: { look: OfficeLook }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    paintGrid(ctx, composePortrait(look), 0, 0)
  }, [look])

  return (
    <canvas
      aria-hidden="true"
      className="office-portrait"
      height={SPRITE_HEIGHT}
      ref={canvasRef}
      width={SPRITE_WIDTH}
    />
  )
}
