import { gridToCanvas } from './officeCanvas'
import type { OfficeLook } from './officeCharacter'
import { WORLD_HEIGHT, WORLD_LEFT, WORLD_TOP, WORLD_WIDTH } from './officeGeometry'
import { composeSeatedSprite } from './officeSprites'
import { drawBackground, drawNoticeContent, SCENE_SEATS } from './officeScene'
import { composeStandingSprite, STAND_FEET_ROW, type Facing, type HeldItem, type StandingPose } from './officeStandingSprites'
import { drawBigWindowFrame, drawWindowFrontProps } from './officeWorld'

/**
 * 업무 화면 머리말의 ‘사무실 장소’ 그림. 사무실에서 그 화면으로 오는 기물(SCENE_HOTSPOTS의 열 가지) 앞을 잘라 보여 주고,
 * 앞에 사람(나, 그리고 관련된 사람)을 세운다. 한 장만 그린다(움직이지 않는다). 영역은 월드 범위(WORLD_LEFT~, WORLD_TOP~) 안이어야 한다.
 */

export type VignettePlace =
  | 'notice'
  | 'kanban'
  | 'cabinet'
  | 'projects'
  | 'nameplates'
  | 'stats'
  | 'logbook'
  | 'samples'
  | 'duties'
  | 'gate'
  | 'my-desk'

type Spot = { x: number; y: number; facing: Facing; pose: StandingPose | 'seated'; held?: HeldItem }

export type VignetteArea = { x: number; y: number; w: number; h: number; spots: readonly Spot[] }

/** 잘라 보여 줄 곳(월드 좌표)과 사람이 서는 곳. 첫 자리는 나, 둘째 자리는 관련된 사람이다. */
export const VIGNETTES: Record<VignettePlace, VignetteArea> = {
  'my-desk': { x: 90, y: 40, w: 88, h: 50, spots: [] },
  notice: {
    x: 204, y: 2, w: 88, h: 50,
    spots: [
      { x: 283, y: 50, facing: 'down', pose: 'talk' },
      { x: 214, y: 50, facing: 'down', pose: 'stand' },
    ],
  },
  kanban: {
    x: 98, y: 2, w: 88, h: 50,
    spots: [
      { x: 176, y: 50, facing: 'down', pose: 'talk' },
      { x: 107, y: 50, facing: 'down', pose: 'stand', held: 'paper' },
    ],
  },
  cabinet: {
    x: 46, y: 2, w: 88, h: 50,
    spots: [
      { x: 112, y: 50, facing: 'down', pose: 'stand', held: 'binder' },
      { x: 56, y: 50, facing: 'down', pose: 'talk' },
    ],
  },
  projects: {
    x: -8, y: 38, w: 88, h: 50,
    spots: [
      { x: 68, y: 86, facing: 'down', pose: 'talk' },
      { x: 0, y: 86, facing: 'down', pose: 'stand', held: 'paper' },
    ],
  },
  nameplates: {
    x: -48, y: 2, w: 88, h: 50,
    spots: [
      { x: -25, y: 50, facing: 'down', pose: 'talk' },
      { x: 24, y: 50, facing: 'down', pose: 'stand' },
    ],
  },
  stats: {
    x: -12, y: 2, w: 88, h: 50,
    spots: [
      { x: 32, y: 50, facing: 'up', pose: 'stand' },
      { x: 64, y: 50, facing: 'down', pose: 'talk', held: 'cup' },
    ],
  },
  logbook: {
    x: 200, y: 192, w: 88, h: 50,
    spots: [
      { x: 255, y: 240, facing: 'up', pose: 'reach', held: 'paper' },
      { x: 212, y: 240, facing: 'down', pose: 'stand' },
    ],
  },
  samples: {
    x: 316, y: 158, w: 88, h: 50,
    spots: [
      { x: 359, y: 208, facing: 'up', pose: 'reach' },
      { x: 394, y: 208, facing: 'down', pose: 'stand', held: 'binder' },
    ],
  },
  duties: {
    x: 344, y: 158, w: 88, h: 50,
    spots: [
      { x: 408, y: 208, facing: 'up', pose: 'stand' },
      { x: 356, y: 208, facing: 'down', pose: 'talk' },
    ],
  },
  gate: {
    x: 162, y: 206, w: 88, h: 50,
    spots: [
      { x: 206, y: 254, facing: 'up', pose: 'stand', held: 'paper' },
      { x: 240, y: 254, facing: 'down', pose: 'talk' },
    ],
  },
}

export function vignetteArea(place: VignettePlace, seatIndex?: number): VignetteArea {
  if (place !== 'my-desk') return VIGNETTES[place]
  const seat = SCENE_SEATS.find(s => s.seatIndex === seatIndex)
  if (!seat) return VIGNETTES.nameplates
  return { x: seat.x - 44, y: seat.spriteY - 8, w: 88, h: 50, spots: [{ x: seat.spriteX, y: seat.spriteY, facing: 'down', pose: 'seated' }] }
}

let stillWorld: HTMLCanvasElement | null | undefined

/** 사람 없는 사무실 한 장(벽·바닥·기물). 모든 장소 그림이 함께 쓴다. */
export function worldStill(): HTMLCanvasElement | null {
  if (stillWorld !== undefined) return stillWorld
  stillWorld = null
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = WORLD_WIDTH
  canvas.height = WORLD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.translate(-WORLD_LEFT, -WORLD_TOP)
  drawBackground(ctx)
  drawBigWindowFrame(ctx)
  drawWindowFrontProps(ctx)
  drawNoticeContent(ctx, 0)
  stillWorld = canvas
  return canvas
}

/**
 * 장소 그림을 target 캔버스에 그린다. scale은 논리 픽셀 한 칸의 캔버스 픽셀 수(정수)다.
 * 사람은 자리 순서대로 세우고, 자리보다 많으면 뺀다.
 */
export function paintVignette(target: HTMLCanvasElement, place: VignettePlace, looks: readonly OfficeLook[], scale: number, seatIndex?: number) {
  const area = vignetteArea(place, seatIndex)
  const world = worldStill()
  const ctx = target.getContext('2d')
  if (!world || !ctx) return
  const temp = document.createElement('canvas')
  temp.width = area.w
  temp.height = area.h
  const composed = temp.getContext('2d')
  if (!composed) return
  composed.drawImage(world, area.x - WORLD_LEFT, area.y - WORLD_TOP, area.w, area.h, 0, 0, area.w, area.h)
  looks.slice(0, area.spots.length).forEach((look, index) => {
    const spot = area.spots[index]
    if (spot.pose === 'seated') {
      const seat = SCENE_SEATS.find(s => s.seatIndex === seatIndex)!
      const sprite = gridToCanvas(composeSeatedSprite(look, { view: seat.view, pose: 'type', frame: 0, expression: 'normal' }))
      if (sprite) composed.drawImage(sprite, spot.x - area.x, spot.y - area.y)
      return
    }
    const sprite = gridToCanvas(composeStandingSprite(look, {
      facing: spot.facing,
      pose: spot.pose,
      frame: 0,
      held: spot.held ?? 'none',
      expression: index === 0 ? 'happy' : 'normal',
    }))
    if (sprite) composed.drawImage(sprite, spot.x - 10 - area.x, spot.y - STAND_FEET_ROW - area.y)
  })
  target.width = area.w * scale
  target.height = area.h * scale
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, target.width, target.height)
  ctx.drawImage(temp, 0, 0, target.width, target.height)
}
