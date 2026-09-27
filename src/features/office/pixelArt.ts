import type { PixelGrid } from './officeSprites'

/** SVG path 하나(같은 색 칸을 모두 담는다) */
export type PixelPath = { color: string; d: string }

const pathCache = new WeakMap<PixelGrid, PixelPath[]>()

/**
 * 도트 격자를 색별 SVG path로 바꾼다. 가로로 이어진 같은 색 칸은 한 사각형으로 묶어
 * 얼굴 하나가 path 십여 개로 끝난다. 벡터라 어떤 배율에서도 칸이 번지지 않는다.
 */
export function gridPaths(grid: PixelGrid): PixelPath[] {
  const cached = pathCache.get(grid)
  if (cached) return cached
  const byColor = new Map<string, string[]>()
  for (let y = 0; y < grid.height; y += 1) {
    let x = 0
    while (x < grid.width) {
      const color = grid.pixels[y * grid.width + x]
      if (!color) {
        x += 1
        continue
      }
      let end = x + 1
      while (end < grid.width && grid.pixels[y * grid.width + end] === color) end += 1
      const parts = byColor.get(color) ?? []
      parts.push(`M${x} ${y}h${end - x}v1h-${end - x}z`)
      byColor.set(color, parts)
      x = end
    }
  }
  const paths = [...byColor].map(([color, parts]) => ({ color, d: parts.join('') }))
  pathCache.set(grid, paths)
  return paths
}
