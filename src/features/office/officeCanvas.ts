import type { PixelGrid } from './officeSprites'

/** 픽셀 격자를 캔버스에 찍는다. 같은 색이 가로로 이어지면 한 번에 칠한다. */
export function paintGrid(ctx: CanvasRenderingContext2D, grid: PixelGrid, x: number, y: number, flip = false) {
  for (let row = 0; row < grid.height; row += 1) {
    let runStart = 0
    let runColor: string | null = null
    for (let column = 0; column <= grid.width; column += 1) {
      const sourceColumn = flip ? grid.width - 1 - column : column
      const color = column < grid.width ? grid.pixels[row * grid.width + sourceColumn] : null
      if (color === runColor) continue
      if (runColor) {
        ctx.fillStyle = runColor
        ctx.fillRect(x + runStart, y + row, column - runStart, 1)
      }
      runStart = column
      runColor = color
    }
  }
}

/** 격자를 작은 캔버스 한 장으로 굳혀 둔다. 같은 장면을 초당 여러 번 그릴 때 drawImage 한 번이면 된다. */
export function gridToCanvas(grid: PixelGrid): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = grid.width
  canvas.height = grid.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  paintGrid(ctx, grid, 0, 0)
  return canvas
}
