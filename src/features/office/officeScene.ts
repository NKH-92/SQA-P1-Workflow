import type { DeskItem, OfficeLook, ScreenKind } from './officeCharacter'
import { SCENE_TOP_BAND, WALL_BOTTOM, WORLD_BOTTOM, WORLD_LEFT, WORLD_RIGHT } from './officeGeometry'
import { BACK_SEAT_ROW, FRONT_TABLE_ROW, SPRITE_WIDTH, type SpriteView } from './officeSprites'
import type { Facing } from './officeStandingSprites'
import { drawFloorZones, drawWindowWallBase, drawWorldExtras } from './officeWorld'

export { SCENE_HEIGHT, SCENE_TOP_BAND, SCENE_WIDTH, VIEW_HEIGHT } from './officeGeometry'

/**
 * 제약회사 QA 사무실 장면(바람의나라풍 3/4 탑다운 시점).
 * 좌표는 논리 픽셀이다. 화면에서는 카드 폭에 맞춰 키우되 한 칸이 흐려지지 않게 그대로 늘린다.
 * 원래 장면(x 0~384, y 0~128) 바깥은 전체 화면 사무실에서만 보이는 곳이다(officeWorld.ts).
 */
const ISLAND_LEFT = 112
const SLOT_WIDTH = 40
const TABLE_FAR = 64
const TABLE_MID = 74
const TABLE_NEAR = 84
const NEAR_SEAT = 105

/** 좁은 화면에서 처음 보여 줄 가운데(책상 섬). 나머지는 옆으로 밀어서 본다. */
export const SCENE_FOCUS_LEFT = ISLAND_LEFT - 20
export const SCENE_FOCUS_RIGHT = ISLAND_LEFT + SLOT_WIDTH * 4 + 20

export type SeatRow = 'window' | 'aisle'

export type SceneSeat = {
  seatIndex: number
  row: SeatRow
  view: SpriteView
  /** 자리 가운데 x */
  x: number
  spriteX: number
  spriteY: number
  /** 이름표 기준점(창가 쪽 줄은 머리 위, 통로 쪽 줄은 의자 아래) */
  labelX: number
  labelY: number
  /** 말풍선과 효과 아이콘을 띄울 머리 위 기준점 */
  headTopY: number
}

export const SEAT_COUNT = 8

export const SCENE_SEATS: readonly SceneSeat[] = Array.from({ length: SEAT_COUNT }, (_, index) => {
  const seatIndex = index + 1
  const row: SeatRow = index < 4 ? 'window' : 'aisle'
  const x = ISLAND_LEFT + SLOT_WIDTH * (index % 4) + SLOT_WIDTH / 2
  const view: SpriteView = row === 'window' ? 'front' : 'back'
  const spriteX = x - SPRITE_WIDTH / 2
  const spriteY = row === 'window' ? TABLE_FAR - FRONT_TABLE_ROW : NEAR_SEAT - BACK_SEAT_ROW
  return {
    seatIndex,
    row,
    view,
    x,
    spriteX,
    spriteY,
    labelX: x,
    labelY: row === 'window' ? spriteY + 4 : NEAR_SEAT + 9,
    headTopY: spriteY + 5,
  }
})

// ── 걷는 길 ──────────────────────────────────────────────
// 사람은 가로·세로 길로만 걷는다(바람의나라처럼 네 방향 이동).
/** 창가 쪽 의자 뒤, 벽 앞 복도(발 위치 y) */
export const CORRIDOR_Y = 48
/** 통로 쪽 의자 앞 통로 */
export const AISLE_Y = 120
/** 책상 섬 왼쪽·오른쪽 세로 길 */
export const LEFT_LANE_X = 98
export const RIGHT_LANE_X = 284
/** 전체 화면 사무실의 아래쪽 복도(회의실·복합기·출입 기록부·샘플 보관장으로 이어진다) */
export const LOWER_Y = 150
/** 통창 앞 창가 바 앞길(커피 머신·창밖 구경·정수기) */
export const BAR_Y = 63

export type CoreTripDestination = 'kanban' | 'notice' | 'cabinet' | 'coffee' | 'window' | 'water' | 'meeting' | 'lounge'
/** 전체 화면 사무실에서만 가는 곳(기존 화면 카드에서는 화면 밖이라 가지 않는다) */
export type WorldTripDestination = 'printer' | 'logbook' | 'samples' | 'duties'
export type TripDestination = CoreTripDestination | WorldTripDestination

export const WORLD_TRIP_DESTINATIONS: readonly WorldTripDestination[] = ['printer', 'logbook', 'samples', 'duties']

export type ScenePoint = { x: number; y: number }

export type TripSpot = ScenePoint & {
  /** 도착해서 바라보는 방향 */
  facing: Facing
}

export const TRIP_SPOTS: Record<TripDestination, TripSpot> = {
  kanban: { x: 138, y: CORRIDOR_Y, facing: 'up' },
  notice: { x: 249, y: CORRIDOR_Y, facing: 'up' },
  cabinet: { x: 80, y: 52, facing: 'up' },
  coffee: { x: 304, y: BAR_Y, facing: 'up' },
  window: { x: 352, y: BAR_Y, facing: 'up' },
  water: { x: 419, y: BAR_Y, facing: 'up' },
  meeting: { x: 58, y: 90, facing: 'left' },
  lounge: { x: 322, y: AISLE_Y, facing: 'down' },
  printer: { x: 110, y: 208, facing: 'up' },
  logbook: { x: 255, y: 206, facing: 'down' },
  samples: { x: 359, y: 214, facing: 'up' },
  duties: { x: 408, y: 214, facing: 'up' },
}

/** 회의실 문(아래쪽 복도에서 들어가는 곳)과 안쪽 둘레 길 */
export const MEETING_DOOR_X = 30
export const MEETING_RING = { top: 176, bottom: 228, left: -28, right: 52 } as const

/**
 * 회의실 안에서 서는 자리(테이블을 둘러싼다). 앞 여섯 자리가 먼저 찬다.
 * 위줄은 테이블 너머(아래를 봄), 아래줄은 테이블 앞(위를 봄), 양 끝은 옆을 본다.
 */
export const MEETING_SPOTS: readonly TripSpot[] = [
  { x: -6, y: 190, facing: 'down' },
  { x: 12, y: 190, facing: 'down' },
  { x: 30, y: 190, facing: 'down' },
  { x: -6, y: 228, facing: 'up' },
  { x: 12, y: 228, facing: 'up' },
  { x: 30, y: 228, facing: 'up' },
  { x: MEETING_RING.left, y: 210, facing: 'right' },
  { x: MEETING_RING.right, y: 210, facing: 'left' },
]

/** 자리에서 일어나 서는 곳. 창가 쪽은 의자 뒤(복도 쪽), 통로 쪽은 의자 앞(통로 쪽)이다. */
export function seatStandSpot(seat: Pick<SceneSeat, 'x' | 'row'>): TripSpot {
  return seat.row === 'window'
    ? { x: seat.x, y: 52, facing: 'down' }
    : { x: seat.x, y: 116, facing: 'up' }
}

// ── 누르면 화면을 옮기는 기물 ────────────────────────────
export type SceneHotspotId =
  | 'calendar'
  | 'menu'
  | 'projects'
  | 'cabinet'
  | 'kanban'
  | 'notice'
  | 'nameplates'
  | 'stats'
  | 'meeting'
  | 'gate'
  | 'logbook'
  | 'samples'
  | 'duties'

export type SceneHotspot = {
  id: SceneHotspotId
  x: number
  y: number
  w: number
  h: number
  /** 기물 위 간판의 아래 가운데. 벽 기물 간판은 천장 띠까지 올라간다. */
  sign: ScenePoint
}

/** 위에서 아래, 왼쪽부터 오른쪽 순서(키보드 이동 순서와 같다). 원래 장면 밖 기물은 전체 화면에서만 보인다. */
export const SCENE_HOTSPOTS: readonly SceneHotspot[] = [
  { id: 'nameplates', x: -46, y: 4, w: 42, h: 32, sign: { x: -25, y: 5 } },
  { id: 'stats', x: 10, y: 3, w: 44, h: 33, sign: { x: 32, y: 4 } },
  { id: 'cabinet', x: 64, y: 5, w: 34, h: 41, sign: { x: 81, y: 11 } },
  { id: 'kanban', x: 112, y: 4, w: 52, h: 29, sign: { x: 138, y: 5 } },
  { id: 'calendar', x: 172, y: 3, w: 22, h: 29, sign: { x: 183, y: 4 } },
  { id: 'notice', x: 224, y: 3, w: 50, h: 31, sign: { x: 249, y: 4 } },
  { id: 'projects', x: 3, y: 41, w: 54, h: 58, sign: { x: 31, y: 43 } },
  { id: 'menu', x: 298, y: 79, w: 28, h: 34, sign: { x: 312, y: 79 } },
  { id: 'meeting', x: -42, y: 146, w: 108, h: 108, sign: { x: 30, y: 146 } },
  { id: 'samples', x: 328, y: 154, w: 48, h: 54, sign: { x: 359, y: 155 } },
  { id: 'duties', x: 386, y: 154, w: 44, h: 52, sign: { x: 408, y: 155 } },
  { id: 'gate', x: 178, y: 216, w: 56, h: 40, sign: { x: 206, y: 217 } },
  { id: 'logbook', x: 242, y: 208, w: 26, h: 30, sign: { x: 255, y: 209 } },
]

type Ctx = CanvasRenderingContext2D

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

/** 도트용 작은 원(지름 5~11). 가로줄 길이를 미리 정해 두어 늘 같은 모양이 나온다. */
function disc(ctx: Ctx, cx: number, cy: number, radius: number, color: string) {
  for (let dy = -radius; dy <= radius; dy += 1) {
    const half = Math.round(Math.sqrt(radius * radius - dy * dy + radius * 0.8))
    rect(ctx, cx - half, cy + dy, half * 2 + 1, 1, color)
  }
}

// ── 배경(벽·창·바닥·뒤쪽 소품) ────────────────────────────

/** 벽은 천장 띠(y<0)까지, 전체 화면 사무실의 양옆 끝까지 이어 그린다. 천장 몰딩은 띠 맨 위에 있다. */
function drawWall(ctx: Ctx) {
  const top = -SCENE_TOP_BAND
  const width = WORLD_RIGHT - WORLD_LEFT
  rect(ctx, WORLD_LEFT, top, width, WALL_BOTTOM - top, '#f2f0eb')
  rect(ctx, WORLD_LEFT, top, width, 2, '#d9d5cd')
  rect(ctx, WORLD_LEFT, top + 2, width, 1, '#e7e3dc')
  // 가운데 흰 벽돌 포인트 벽
  const left = 104
  const right = 280
  const brickTop = top + 3
  rect(ctx, left, brickTop, right - left, WALL_BOTTOM - 2 - brickTop, '#ece8e1')
  for (let y = brickTop, course = 0; y < WALL_BOTTOM - 2; y += 4, course += 1) {
    rect(ctx, left, y + 3, right - left, 1, '#dcd6cc')
    for (let x = left + (course % 2 === 0 ? 0 : 6); x < right; x += 12) rect(ctx, x, y, 1, 3, '#dcd6cc')
  }
  rect(ctx, left - 1, brickTop, 1, WALL_BOTTOM - 2 - brickTop, '#d9d4cb')
  rect(ctx, right, brickTop, 1, WALL_BOTTOM - 2 - brickTop, '#d9d4cb')
  // 걸레받이
  rect(ctx, WORLD_LEFT, WALL_BOTTOM - 2, WORLD_RIGHT - WORLD_LEFT, 2, '#cfcbc3')
}

function blend(a: string, b: string) {
  const parse = (hex: string) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16))
  const [ar, ag, ab] = parse(a)
  const [br, bg, bb] = parse(b)
  return `#${[(ar + br) >> 1, (ag + bg) >> 1, (ab + bb) >> 1].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

/** 검토요청 보드(대기·진행·완료 세 칸 칸반) */
function drawKanban(ctx: Ctx, x: number, y: number) {
  rect(ctx, x, y, 48, 24, '#9aa0a8')
  rect(ctx, x + 1, y + 1, 46, 22, '#fdfdfb')
  const headers = ['#e2554b', '#ffcc3d', '#43b596']
  const notes = [
    ['#ffe58a', '#ffb3c6', '#ffe58a', '#b9dcff'],
    ['#b9dcff', '#ffe58a', '#c8f0d8'],
    ['#c8f0d8', '#ffe58a', '#c8f0d8', '#ffb3c6', '#c8f0d8'],
  ]
  headers.forEach((color, column) => {
    const cx = x + 3 + column * 15
    rect(ctx, cx, y + 3, 13, 2, color)
    notes[column].forEach((note, index) => {
      const nx = cx + (index % 2) * 7
      const ny = y + 7 + Math.floor(index / 2) * 5
      rect(ctx, nx, ny, 6, 4, note)
      rect(ctx, nx, ny + 3, 6, 1, blend(note, '#b8a888'))
    })
    if (column < 2) rect(ctx, cx + 14, y + 3, 1, 19, '#e5e5e0')
  })
  // 마커 트레이
  rect(ctx, x + 6, y + 24, 36, 1, '#b8bcc2')
  rect(ctx, x + 10, y + 23, 4, 1, '#3d7bd8')
  rect(ctx, x + 15, y + 23, 4, 1, '#e2554b')
}

const NOTICE_SCREEN = { x: 226, y: 5 }

function drawNoticeFrame(ctx: Ctx) {
  const { x, y } = NOTICE_SCREEN
  rect(ctx, x, y, 46, 27, '#1d2027')
  rect(ctx, x + 2, y + 2, 42, 22, '#0f1c33')
  rect(ctx, x + 20, y + 27, 6, 1, '#6b7079')
}

function drawClockFace(ctx: Ctx, cx: number, cy: number) {
  disc(ctx, cx, cy, 6, '#2c3038')
  disc(ctx, cx, cy, 5, '#fbfbf8')
  for (const [dx, dy] of [[0, -4], [4, 0], [0, 4], [-4, 0]]) rect(ctx, cx + dx, cy + dy, 1, 1, '#8a8f98')
}

/** 변경관리 문서함(유리문 안에 색깔별 바인더) */
function drawDocumentCabinet(ctx: Ctx) {
  const x = 66
  const y = 12
  rect(ctx, x, y, 30, 32, '#b9c0ca')
  rect(ctx, x + 1, y + 1, 28, 30, '#e9edf1')
  const binders = ['#3d7bd8', '#ffcc3d', '#43b596', '#e2554b', '#8a63d2', '#34497a']
  for (let shelf = 0; shelf < 3; shelf += 1) {
    const sy = y + 3 + shelf * 9
    for (let index = 0; index < 6; index += 1) {
      rect(ctx, x + 3 + index * 4, sy, 3, 7, binders[(index + shelf * 2) % binders.length])
      rect(ctx, x + 4 + index * 4, sy + 2, 1, 2, '#fbfbf7')
    }
    rect(ctx, x + 1, sy + 7, 28, 1, '#b9c0ca')
  }
  rect(ctx, x + 15, y + 1, 1, 30, '#c9d0d9')
  rect(ctx, x + 13, y + 14, 1, 3, '#5b6069')
  rect(ctx, x + 17, y + 14, 1, 3, '#5b6069')
  // 위 칸: 이름표와 작은 화분
  rect(ctx, x + 6, y - 3, 14, 3, '#34497a')
  rect(ctx, x + 8, y - 2, 10, 1, '#fbfbf7')
  rect(ctx, x + 23, y - 3, 6, 3, '#f3f1ec')
  rect(ctx, x + 24, y - 7, 4, 4, '#3f8a4f')
  rect(ctx, x + 25, y - 8, 2, 1, '#6cbf6d')
}

/** 프로젝트 회의 공간: 간트 차트 이동식 화이트보드와 원형 회의 테이블 */
function drawProjectCorner(ctx: Ctx) {
  // 이동식 화이트보드(간트 차트)
  rect(ctx, 8, 44, 46, 20, '#9aa0a8')
  rect(ctx, 9, 45, 44, 18, '#fdfdfb')
  rect(ctx, 9, 45, 44, 3, '#e8edf4')
  for (let tick = 13; tick < 53; tick += 8) rect(ctx, tick, 46, 1, 1, '#9aa3ae')
  const bars: ReadonlyArray<readonly [number, number, string]> = [
    [11, 14, '#3d7bd8'],
    [18, 16, '#43b596'],
    [24, 12, '#ffcc3d'],
    [30, 18, '#e2554b'],
    [16, 22, '#8a63d2'],
  ]
  bars.forEach(([start, length, color], index) => {
    rect(ctx, start, 49 + index * 3, Math.min(length, 52 - start), 2, color)
  })
  rect(ctx, 36, 47, 1, 16, '#e2554b')
  rect(ctx, 12, 64, 2, 6, '#8f959e')
  rect(ctx, 48, 64, 2, 6, '#8f959e')
  rect(ctx, 9, 70, 8, 1, '#5b6069')
  rect(ctx, 45, 70, 8, 1, '#5b6069')
  // 회의 의자 둘(테이블 뒤쪽)
  for (const chairX of [16, 36]) {
    rect(ctx, chairX, 75, 10, 7, '#262b33')
    rect(ctx, chairX + 1, 76, 8, 5, '#3b424e')
  }
  // 원형 테이블
  for (let dy = -5; dy <= 5; dy += 1) {
    const half = Math.round(Math.sqrt(1 - (dy * dy) / 30) * 15)
    rect(ctx, 30 - half, 86 + dy, half * 2, 1, dy === -5 ? '#e1dfd8' : '#f6f5f1')
  }
  rect(ctx, 16, 91, 28, 2, '#cfccc4')
  rect(ctx, 28, 93, 4, 5, '#8f959e')
  rect(ctx, 23, 98, 14, 1, '#5b6069')
  // 테이블 위 노트북과 서류
  rect(ctx, 22, 82, 9, 5, '#c7ccd3')
  rect(ctx, 23, 83, 7, 3, '#5fa8e8')
  rect(ctx, 21, 87, 11, 1, '#9aa1ab')
  rect(ctx, 34, 84, 6, 4, '#fbfbf7')
  rect(ctx, 35, 85, 4, 1, '#b8bcc2')
  rect(ctx, 35, 86, 3, 1, '#b8bcc2')
}

/** 나무 바닥. 전체 화면 사무실 끝까지 같은 무늬로 이어진다(원래 장면과 이음매가 맞는다). */
function drawFloor(ctx: Ctx) {
  const tones = ['#e2c69c', '#dec196', '#e6cca5', '#dbbd92']
  const width = WORLD_RIGHT - WORLD_LEFT
  for (let y = WALL_BOTTOM, row = 0; y < WORLD_BOTTOM; y += 5, row += 1) {
    rect(ctx, WORLD_LEFT, y, width, 5, tones[row % tones.length])
    rect(ctx, WORLD_LEFT, y + 4, width, 1, '#c9aa7c')
    const offset = (row * 29) % 56
    const first = offset - Math.ceil((offset - WORLD_LEFT) / 56) * 56
    for (let x = first; x < WORLD_RIGHT; x += 56) rect(ctx, x, y, 1, 4, '#cdb084')
  }
  // 벽 바로 앞 그늘
  rect(ctx, WORLD_LEFT, WALL_BOTTOM, width, 2, '#c9ab80')
}

/**
 * 벽·바닥·뒤쪽 가구(사람보다 늘 뒤). 한 번만 그린다.
 * 통창 유리 자리는 비워 두고, 하늘은 렌더러가 시각에 맞춰 장마다 그린다(officeSky).
 */
function drawWallCalendar(ctx: Ctx, x: number, y: number) {
  rect(ctx, x + 1, y + 1, 20, 24, '#1b2d4f')
  rect(ctx, x, y, 20, 24, '#f7f7f5')
  rect(ctx, x, y, 20, 5, '#3d7bd8')
  rect(ctx, x + 4, y - 2, 2, 4, '#1b2d4f')
  rect(ctx, x + 14, y - 2, 2, 4, '#1b2d4f')
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
    rect(ctx, x + 3 + col * 4, y + 8 + row * 5, 2, 2, row === 1 && col === 2 ? '#ffcc3d' : '#9fb4d6')
  }
}

export function drawBackground(ctx: Ctx) {
  drawWall(ctx)
  drawWindowWallBase(ctx)
  drawKanban(ctx, 114, 6)
  drawWallCalendar(ctx, 173, 6)
  drawClockFace(ctx, 200, 15)
  drawNoticeFrame(ctx)
  drawFloor(ctx)
  drawFloorZones(ctx)
  drawDocumentCabinet(ctx)
  drawProjectCorner(ctx)
  // 책상 섬 그림자
  rect(ctx, ISLAND_LEFT - 4, TABLE_NEAR + 4, SLOT_WIDTH * 4 + 8, 6, '#b3c0cf')
  drawWorldExtras(ctx)
}

// ── 의자 ─────────────────────────────────────────────────

/** 창가 쪽 줄 의자 등받이(사람 뒤에 보인다). */
export function drawWindowChair(ctx: Ctx, seat: SceneSeat) {
  const x = seat.x - 8
  const y = seat.spriteY + 13
  rect(ctx, x + 1, y, 14, 1, '#262b33')
  rect(ctx, x, y + 1, 16, 12, '#262b33')
  rect(ctx, x + 1, y + 1, 14, 11, '#3b424e')
  for (let line = y + 3; line < y + 12; line += 2) rect(ctx, x + 2, line, 12, 1, '#4a5260')
}

/** 통로 쪽 줄 의자(사람 앞, 등받이와 다리까지 보인다). */
export function drawAisleChair(ctx: Ctx, seat: SceneSeat) {
  const x = seat.x - 7
  const top = NEAR_SEAT - 5
  rect(ctx, x + 1, top, 12, 1, '#262b33')
  rect(ctx, x, top + 1, 14, 8, '#262b33')
  rect(ctx, x + 1, top + 1, 12, 7, '#3b424e')
  for (let line = top + 2; line < top + 8; line += 2) rect(ctx, x + 2, line, 10, 1, '#4a5260')
  rect(ctx, x - 1, top + 9, 16, 2, '#262b33')
  rect(ctx, seat.x - 1, top + 11, 2, 3, '#4a5260')
  rect(ctx, x + 1, top + 14, 12, 1, '#262b33')
  rect(ctx, x + 1, top + 15, 2, 1, '#1a1d22')
  rect(ctx, x + 11, top + 15, 2, 1, '#1a1d22')
  rect(ctx, seat.x - 1, top + 15, 2, 1, '#1a1d22')
}

/** 창가 쪽 의자가 앞뒤 순서를 정할 때 쓰는 바닥 y */
export const WINDOW_CHAIR_BASE_Y = TABLE_FAR
/** 통로 쪽 의자가 앞뒤 순서를 정할 때 쓰는 바닥 y */
export const AISLE_CHAIR_BASE_Y = NEAR_SEAT + 10
/** 책상 섬이 앞뒤 순서를 정할 때 쓰는 바닥 y(앞 모서리 다리) */
export const ISLAND_BASE_Y = TABLE_NEAR + 12

// ── 책상 섬 ──────────────────────────────────────────────

const DESK_TOP = '#f6f5f1'
const DESK_LINE = '#e1dfd8'

function drawKeyboard(ctx: Ctx, cx: number, y: number) {
  rect(ctx, cx - 6, y, 12, 3, '#9aa0a8')
  rect(ctx, cx - 5, y, 10, 2, '#e4e7eb')
  for (let kx = cx - 5; kx < cx + 5; kx += 2) rect(ctx, kx, y + 1, 1, 1, '#c3c8cf')
}

function drawDeskItem(ctx: Ctx, item: DeskItem, x: number, y: number, accent: string) {
  switch (item) {
    case 'plant':
      rect(ctx, x, y + 2, 5, 3, '#f3f1ec')
      rect(ctx, x, y + 4, 5, 1, '#d4d0c7')
      rect(ctx, x - 1, y - 1, 3, 3, '#3f8a4f')
      rect(ctx, x + 2, y - 2, 3, 3, '#6cbf6d')
      rect(ctx, x + 1, y, 2, 2, '#2d6b3b')
      break
    case 'cactus':
      rect(ctx, x, y + 3, 5, 2, '#c7744a')
      rect(ctx, x + 1, y - 2, 3, 5, '#4f9a5b')
      rect(ctx, x + 2, y - 2, 1, 5, '#6cbf6d')
      rect(ctx, x + 4, y, 1, 2, '#4f9a5b')
      break
    case 'photo':
      rect(ctx, x, y, 5, 5, '#2e2a2a')
      rect(ctx, x + 1, y + 1, 3, 3, '#8cc8ef')
      rect(ctx, x + 1, y + 3, 3, 1, '#6cbf6d')
      break
    case 'figure':
      rect(ctx, x + 1, y - 1, 3, 3, '#fde3cf')
      rect(ctx, x + 1, y - 2, 3, 1, '#35303b')
      rect(ctx, x + 1, y + 2, 3, 3, accent)
      rect(ctx, x, y + 4, 5, 1, '#2e2a2a')
      break
    case 'binder':
      // 세워 둔 SOP 바인더
      rect(ctx, x, y - 2, 5, 7, accent)
      rect(ctx, x + 1, y, 3, 2, '#fbfbf7')
      rect(ctx, x, y + 4, 5, 1, '#2e2a2a')
      break
    case 'vials':
      // 검체 바이알 거치대
      rect(ctx, x - 1, y + 3, 7, 2, '#8f959e')
      for (const vialX of [x, x + 2, x + 4]) {
        rect(ctx, vialX, y, 1, 3, '#dff1fb')
        rect(ctx, vialX, y - 1, 1, 1, accent)
      }
      break
    default:
      break
  }
}

export type DeskOccupant = {
  seatIndex: number
  look: OfficeLook
}

/**
 * 책상 섬 뒤쪽 층: 상판, 다리, 창가 쪽 키보드와 모니터 뒷면.
 * 창가 쪽 사람 바로 앞에 그리고, 그 위에 손을 올린다. 한 번만 그린다.
 */
export function drawIslandBack(ctx: Ctx) {
  const left = ISLAND_LEFT - 4
  const width = SLOT_WIDTH * 4 + 8
  rect(ctx, left, TABLE_FAR - 1, width, 1, '#cfccc4')
  rect(ctx, left, TABLE_FAR, width, TABLE_NEAR - TABLE_FAR, DESK_TOP)
  for (let index = 1; index < 4; index += 1) {
    rect(ctx, ISLAND_LEFT + SLOT_WIDTH * index, TABLE_FAR, 1, TABLE_NEAR - TABLE_FAR, DESK_LINE)
  }
  rect(ctx, left, TABLE_NEAR, width, 3, '#dedcd5')
  rect(ctx, left, TABLE_NEAR + 3, width, 1, '#aeaba3')
  for (const legX of [left + 1, left + width - 3]) rect(ctx, legX, TABLE_NEAR + 4, 2, 8, '#2b2d33')

  for (const seat of SCENE_SEATS) {
    if (seat.row !== 'window') continue
    // 키보드가 사람 쪽, 모니터(뒷면)가 칸막이 쪽이라 모니터를 나중에 그린다.
    drawKeyboard(ctx, seat.x, TABLE_FAR + 1)
    rect(ctx, seat.x - 17, TABLE_FAR - 3, 13, 9, '#2c3038')
    rect(ctx, seat.x - 16, TABLE_FAR - 2, 11, 7, '#454b56')
    rect(ctx, seat.x - 12, TABLE_FAR - 1, 3, 2, '#5b626e')
  }
}

/** 책상 섬 앞쪽 층: 가운데 칸막이와 통로 쪽 모니터·키보드·소품. */
export function drawIslandFront(ctx: Ctx, occupants: readonly DeskOccupant[]) {
  const left = ISLAND_LEFT - 4
  const width = SLOT_WIDTH * 4 + 8
  rect(ctx, left + 2, TABLE_MID - 6, width - 4, 1, '#c7d8ea')
  rect(ctx, left + 2, TABLE_MID - 5, width - 4, 5, '#6f93bd')
  rect(ctx, left + 2, TABLE_MID - 1, width - 4, 1, '#5a7ca5')
  for (let index = 1; index < 4; index += 1) rect(ctx, ISLAND_LEFT + SLOT_WIDTH * index, TABLE_MID - 5, 1, 5, '#5a7ca5')

  const bySeat = new Map(occupants.map((occupant) => [occupant.seatIndex, occupant]))
  for (const seat of SCENE_SEATS) {
    if (seat.row !== 'aisle') continue
    const look = bySeat.get(seat.seatIndex)?.look
    rect(ctx, seat.x + 2, TABLE_MID - 9, 17, 12, '#1f2228')
    rect(ctx, seat.x + 3, TABLE_MID - 8, 15, 9, look ? '#16233a' : '#2b2f37')
    rect(ctx, seat.x + 9, TABLE_MID + 3, 3, 4, '#8f959e')
    rect(ctx, seat.x + 7, TABLE_MID + 7, 7, 1, '#8f959e')
    drawKeyboard(ctx, seat.x - 1, TABLE_NEAR - 6)
    if (look) drawDeskItem(ctx, look.deskItem, seat.x - 19, TABLE_NEAR - 8, look.accent)
  }
}

/** 통로 쪽 모니터 화면 안쪽(움직이는 부분). */
export function drawScreen(ctx: Ctx, seat: SceneSeat, kind: ScreenKind, tick: number, active: boolean) {
  const x = seat.x + 3
  const y = TABLE_MID - 8
  const w = 15
  const h = 9
  rect(ctx, x, y, w, h, '#16233a')
  const scroll = active ? tick : 0
  switch (kind) {
    case 'document': {
      // SOP·일탈 보고서 문서: 제목 줄, 본문, 결재 도장 칸
      rect(ctx, x, y, w, h, '#fbfbf7')
      rect(ctx, x + 1, y + 1, 8, 1, '#34497a')
      const widths = [11, 9, 12, 7, 10, 12, 8]
      for (let line = 0; line < 3; line += 1) {
        rect(ctx, x + 1, y + 3 + line * 2, widths[(line + scroll) % widths.length], 1, '#b8bcc2')
      }
      rect(ctx, x + 11, y + 1, 3, 3, '#e2554b')
      rect(ctx, x + 12, y + 2, 1, 1, '#fbfbf7')
      break
    }
    case 'sheet': {
      // 배치 기록서 표
      rect(ctx, x, y, w, h, '#f4f6f8')
      for (let gx = x + 3; gx < x + w; gx += 4) rect(ctx, gx, y, 1, h, '#d4dae2')
      for (let gy = y + 2; gy < y + h; gy += 2) rect(ctx, x, gy, w, 1, '#d4dae2')
      rect(ctx, x, y, w, 1, '#43b596')
      rect(ctx, x + 4 + ((scroll % 3) * 4), y + 3 + (scroll % 3) * 2, 3, 1, '#3d7bd8')
      break
    }
    case 'report': {
      // 시험 결과: 적합(초록)·부적합(빨강) 줄
      rect(ctx, x, y, w, h, '#f7f7f5')
      for (let line = 0; line < 4; line += 1) {
        const pass = (line + scroll) % 5 !== 3
        rect(ctx, x + 1, y + 1 + line * 2, 1, 1, pass ? '#43b596' : '#e2554b')
        rect(ctx, x + 3, y + 1 + line * 2, 8 - ((line + scroll) % 3) * 2, 1, '#9aa3ae')
      }
      break
    }
    case 'chat': {
      // 위탁사와 주고받는 메신저
      rect(ctx, x, y, w, h, '#eef3fa')
      const lines = [[1, 7, '#3d7bd8'], [6, 8, '#d6dde7'], [2, 6, '#3d7bd8'], [5, 9, '#d6dde7']] as const
      for (let line = 0; line < 4; line += 1) {
        const [offset, width, color] = lines[(line + scroll) % lines.length]
        rect(ctx, x + offset, y + 1 + line * 2, width, 1, color)
      }
      break
    }
    case 'chart': {
      // 안정성 시험 추세 그래프
      rect(ctx, x, y, w, h, '#f7f7f5')
      const bars = [3, 5, 4, 7, 6, 8]
      bars.forEach((bar, index) => {
        const height = Math.min(h - 2, bar + ((index + scroll) % 2))
        rect(ctx, x + 1 + index * 2, y + h - 1 - height, 1, height, index === 5 ? '#ffcc3d' : '#3d7bd8')
      })
      break
    }
    default:
      break
  }
}

/** 자리를 비운 통로 쪽 모니터. 휴가·출장이면 꺼 두고, 잠깐 비웠으면 잠금 화면(자물쇠)이다. */
export function drawScreenAway(ctx: Ctx, seat: SceneSeat, mode: 'off' | 'lock') {
  const x = seat.x + 3
  const y = TABLE_MID - 8
  rect(ctx, x, y, 15, 9, mode === 'off' ? '#101318' : '#1b2d4f')
  if (mode === 'off') {
    rect(ctx, x + 1, y + 1, 4, 1, '#2a2f38')
    return
  }
  rect(ctx, x + 6, y + 1, 3, 1, '#9fb4d6')
  rect(ctx, x + 5, y + 2, 1, 2, '#9fb4d6')
  rect(ctx, x + 9, y + 2, 1, 2, '#9fb4d6')
  rect(ctx, x + 5, y + 4, 5, 4, '#dce8ff')
  rect(ctx, x + 7, y + 5, 1, 2, '#1b2d4f')
}

/** 벽시계 바늘(서울 시각). */
export function drawClockHands(ctx: Ctx, hour: number, minute: number) {
  const cx = 200
  const cy = 15
  const minuteAngle = (minute / 60) * Math.PI * 2
  const hourAngle = (((hour % 12) + minute / 60) / 12) * Math.PI * 2
  for (let step = 1; step <= 4; step += 1) {
    rect(ctx, cx + Math.round(Math.sin(minuteAngle) * step), cy - Math.round(Math.cos(minuteAngle) * step), 1, 1, '#2c3038')
  }
  for (let step = 1; step <= 2; step += 1) {
    rect(ctx, cx + Math.round(Math.sin(hourAngle) * step), cy - Math.round(Math.cos(hourAngle) * step), 1, 1, '#e2554b')
  }
  rect(ctx, cx, cy, 1, 1, '#2c3038')
}

/** 공지 화면 내용. 몇 초마다 다음 공지로 넘어가는 것처럼 줄이 바뀐다. */
export function drawNoticeContent(ctx: Ctx, tick: number) {
  const x = NOTICE_SCREEN.x + 2
  const y = NOTICE_SCREEN.y + 2
  rect(ctx, x, y, 42, 22, '#0f1c33')
  // 머리 줄: 확성기와 제목 막대
  rect(ctx, x, y, 42, 5, '#105bd8')
  rect(ctx, x + 2, y + 1, 2, 3, '#fbfbf7')
  rect(ctx, x + 4, y + 1, 1, 3, '#fbfbf7')
  rect(ctx, x + 5, y + 1, 1, 1, '#fbfbf7')
  rect(ctx, x + 5, y + 3, 1, 1, '#fbfbf7')
  rect(ctx, x + 8, y + 2, 14, 1, '#dce8ff')
  // 고정 공지 표시와 본문 줄
  const page = ((tick % 3) + 3) % 3
  rect(ctx, x + 2, y + 8, 3, 3, '#ffcc3d')
  const widths = [[30, 22, 26, 18], [26, 30, 16, 24], [22, 26, 30, 14]][page]
  rect(ctx, x + 7, y + 8, widths[0], 1, '#fbfbf7')
  rect(ctx, x + 7, y + 10, widths[1] - 6, 1, '#8ea5c4')
  rect(ctx, x + 2, y + 14, widths[2], 1, '#dce8ff')
  rect(ctx, x + 2, y + 16, widths[3], 1, '#8ea5c4')
  // 쪽 표시 점
  for (let dot = 0; dot < 3; dot += 1) rect(ctx, x + 17 + dot * 3, y + 19, 2, 1, dot === page ? '#ffcc3d' : '#34495e')
}
