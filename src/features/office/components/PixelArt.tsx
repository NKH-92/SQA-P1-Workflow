import type { PixelGrid } from '../officeSprites'
import { gridPaths } from '../pixelArt'

/** 도트 격자 한 장을 SVG로 그린다(장식이라 보조기기에는 숨긴다). 크기는 CSS가 정한다. */
export function PixelArt({ grid, className }: { grid: PixelGrid; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${grid.width} ${grid.height}`}
    >
      {gridPaths(grid).map((path) => <path d={path.d} fill={path.color} key={path.color} />)}
    </svg>
  )
}
