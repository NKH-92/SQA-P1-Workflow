import { prefersReducedMotion } from '../../lib/motion'
import type { PresenceKind } from '../../data/validation/memberPresence'
import { actorPose, advanceActor, createActor, staticPose, type ActorPose, type OfficeAction, type OfficeActor } from './officeBehavior'
import { gridToCanvas, paintGrid } from './officeCanvas'
import { seededRandom, type OfficeCharacter } from './officeCharacter'
import {
  CORE_CAMERA,
  isWorldCamera,
  WORLD_HEIGHT,
  WORLD_LEFT,
  WORLD_TOP,
  WORLD_WIDTH,
  type OfficeCamera,
} from './officeGeometry'
import { pixelIconGrid } from './officePixelIcons'
import {
  AISLE_CHAIR_BASE_Y,
  drawAisleChair,
  drawBackground,
  drawClockHands,
  drawIslandBack,
  drawIslandFront,
  drawNoticeContent,
  drawScreen,
  drawScreenAway,
  drawWindowChair,
  ISLAND_BASE_Y,
  MEETING_SPOTS,
  SCENE_HEIGHT,
  SCENE_SEATS,
  SCENE_WIDTH,
  WINDOW_CHAIR_BASE_Y,
  type SceneSeat,
  type TripDestination,
} from './officeScene'
import { createSkyPainter, rgbText, type SkyPeriod, type SkyState } from './officeSky'
import { composeSeatedSprite, DESK_PAPERS, HEAD_Y } from './officeSprites'
import { composeStandingSprite, STAND_FEET_ROW, type StandingFrame } from './officeStandingSprites'
import {
  advanceTrip,
  chooseDestination,
  planMeetingTrip,
  planTrip,
  printerProgress,
  redirectToMeeting,
  releaseTrip,
  TRIP_LINES,
  tripPose,
  type Trip,
} from './officeWalk'
import {
  BIG_WINDOW,
  drawBigWindowFrame,
  drawLogbookPodium,
  drawMeetingBackGlass,
  drawMeetingFrontGlass,
  drawMeetingTable,
  drawPrinterPaper,
  drawWindowFrontProps,
  LOGBOOK_BASE_Y,
  LOUNGE_LAMP,
  MEETING_BACK_BASE_Y,
  MEETING_FRONT_BASE_Y,
  MEETING_TABLE_BASE_Y,
  MEETING_ROOM,
  WINDOW_FRONT_AREAS,
} from './officeWorld'

export type OfficeOccupant = {
  seatIndex: number
  character: OfficeCharacter
}

export type OfficeBubble = {
  id: number
  seatIndex: number
  text: string
}

export type OfficeViewport = {
  /** 캔버스 실제 크기(장치 픽셀). 화면 크기와 1:1이라 브라우저가 다시 늘리지 않는다. */
  canvasWidth: number
  canvasHeight: number
}

export type OfficeClock = { hour: number; minute: number }

/** 자리를 비운 사람(자리 번호와 상태). 캐릭터 대신 빈 의자와 상태 표지가 보인다. */
export type OfficeAbsence = { seatIndex: number; kind: PresenceKind }

/** 이름표·누르는 영역·말풍선을 캔버스 위에 맞춰 놓기 위한 사람별 위치(논리 픽셀) */
export type ActorAnchor = {
  seatIndex: number
  /** 몸 가운데 x */
  x: number
  /** 머리 꼭대기 y(자리를 비웠으면 상태 표지 위) */
  headTop: number
  /** 누르는 영역 아래 끝 y */
  bottom: number
  /** 자리를 비우고 서 있는지(걷는 중 포함) */
  standing: boolean
  /** 통로 쪽 줄에 앉아 있으면 의자 아래 이름표 y, 아니면 null(머리 위) */
  labelBelowY: number | null
}

export type OfficeRenderer = {
  setDeskPiles(piles: Map<number, 0 | 1 | 2 | 3>): void
  announceWork(seatIndex: number, now: number): void
  deliverPaper(seatIndex: number, now: number): void
  setOccupants(occupants: readonly OfficeOccupant[]): void
  setViewport(viewport: OfficeViewport): void
  /** 화면에 담을 영역. 전체 화면 사무실이면 아래쪽 목적지까지 다녀온다. */
  setCamera(camera: OfficeCamera): void
  /** 회의에 들어간(확인한) 사람의 자리 번호. 이 사람들은 회의실로 가서 회의가 끝날 때까지 머문다. */
  setMeeting(attendeeSeats: readonly number[]): void
  /** 자리를 비운 사람(휴가·출장·현장 등). 캐릭터 대신 빈 의자와 상태 표지를 그린다. */
  setAbsences(absences: readonly OfficeAbsence[]): void
  /** animate=false면 모두 자리에 앉아 타자 치는 자세로 멈춘 한 장면만 그린다(동작 줄이기). */
  draw(now: number, options: { animate: boolean; clock: OfficeClock }): void
  anchors(): ActorAnchor[]
  /** 지금 창밖 시간대(마지막으로 그린 장 기준) */
  skyPeriod(): SkyPeriod
  destroy(): void
}

const BUBBLE_DURATION = 2800
const MAX_BUBBLES = 2
const CHATTER_GAP: readonly [number, number] = [9000, 16000]
/** 누군가 자리를 뜨는 간격 */
const TRIP_GAP: readonly [number, number] = [9000, 20000]
/** 창가 쪽 책상 먼 모서리 y. 이 아래로 보이는 손은 책상 위에 다시 그린다. */
const TABLE_FAR_Y = 64
/** 동작이 시작될 때 말풍선을 띄울 확률 */
const ACTION_BUBBLE_CHANCE: Partial<Record<OfficeAction, number>> = {
  idea: 0.9,
  found: 0.9,
  phone: 0.6,
  stretch: 0.35,
  sip: 0.3,
}
const ARRIVAL_BUBBLE_CHANCE = 0.8
/** 창밖을 구경하러 간 사람이 시간대에 맞춰 하는 말 */
const WINDOW_LINES: Record<SkyPeriod, readonly string[]> = {
  새벽: ['해 뜨기 직전이네', '새벽 공기 좋다'],
  아침: ['아침 햇살 좋다!', '오늘도 힘내 봐요'],
  낮: ['하늘 파랗다', '점심 뭐 먹지?'],
  오후: ['오후엔 역시 커피', '해가 기울기 시작하네'],
  저녁: ['노을 진짜 예쁘다', '오늘 하루도 수고했어요'],
  밤: ['야경 멋지다…', '남산타워 불 켜졌네'],
}
/** 상태 표지 말풍선 크기(아이콘 12칸 + 테두리) */
const BADGE_SIZE = 16

type Actor = {
  seat: SceneSeat
  character: OfficeCharacter
  actor: OfficeActor
  trip: Trip | null
}

type Ctx = CanvasRenderingContext2D

function createLayer(width = SCENE_WIDTH, height = SCENE_HEIGHT) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  return ctx ? { canvas, ctx } : null
}

function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

const INK = '#231a1f'

function drawEffect(ctx: Ctx, seat: SceneSeat, pose: ActorPose, now: number) {
  const x = seat.x
  const top = seat.headTopY
  switch (pose.effect) {
    case 'think': {
      px(ctx, x + 5, top - 10, 11, 7, INK)
      px(ctx, x + 6, top - 11, 9, 9, INK)
      px(ctx, x + 6, top - 10, 9, 7, '#ffffff')
      const dots = 1 + (Math.floor(now / 350) % 3)
      for (let index = 0; index < dots; index += 1) px(ctx, x + 8 + index * 2, top - 7, 1, 1, INK)
      px(ctx, x + 5, top - 2, 2, 2, INK)
      px(ctx, x + 3, top, 1, 1, INK)
      break
    }
    case 'idea': {
      const bx = x - 3
      const by = top - 13
      px(ctx, bx + 1, by, 5, 1, INK)
      px(ctx, bx, by + 1, 7, 5, INK)
      px(ctx, bx + 1, by + 1, 5, 4, '#ffe066')
      px(ctx, bx + 2, by + 1, 2, 1, '#fff7c2')
      px(ctx, bx + 2, by + 6, 3, 2, '#8f959e')
      px(ctx, bx + 1, by + 6, 1, 2, INK)
      px(ctx, bx + 5, by + 6, 1, 2, INK)
      if (Math.floor(now / 250) % 2 === 0) {
        px(ctx, bx - 2, by + 2, 1, 1, '#ffcc3d')
        px(ctx, bx + 8, by + 2, 1, 1, '#ffcc3d')
        px(ctx, bx + 3, by - 2, 1, 1, '#ffcc3d')
      }
      break
    }
    case 'found': {
      const bx = x - 3
      const by = top - 13
      px(ctx, bx, by, 7, 10, INK)
      px(ctx, bx + 1, by + 1, 5, 8, '#ffffff')
      px(ctx, bx + 3, by + 2, 1, 4, '#e2554b')
      px(ctx, bx + 3, by + 7, 1, 1, '#e2554b')
      break
    }
    case 'music': {
      const rise = Math.floor(now / 200) % 6
      const nx = x + 8 + (rise % 2)
      const ny = top - 2 - rise
      px(ctx, nx + 2, ny, 1, 4, INK)
      px(ctx, nx + 2, ny, 2, 1, INK)
      px(ctx, nx, ny + 3, 3, 2, INK)
      px(ctx, nx + 1, ny + 3, 1, 1, '#8a63d2')
      break
    }
    case 'call': {
      if (Math.floor(now / 300) % 2 === 0) {
        const cx = x + 11
        const cy = top + 6
        px(ctx, cx, cy, 1, 1, INK)
        px(ctx, cx + 1, cy - 1, 1, 3, INK)
        px(ctx, cx + 3, cy - 2, 1, 5, INK)
      }
      break
    }
    default:
      break
  }
}

/** 창가 쪽은 모니터 왼쪽(앞줄 모니터에 가리지 않는 곳), 통로 쪽은 키보드 왼쪽 */
function mugPosition(seat: SceneSeat) {
  return seat.row === 'window' ? { x: seat.x - 22, y: 64 } : { x: seat.x - 13, y: 76 }
}

function drawDeskMug(ctx: Ctx, seat: SceneSeat, color: string, steam: boolean, now: number) {
  const { x, y } = mugPosition(seat)
  px(ctx, x, y, 4, 4, '#2e2a2a')
  px(ctx, x + 1, y + 1, 2, 3, color)
  px(ctx, x + 1, y, 2, 1, '#6b4a2f')
  px(ctx, x + 4, y + 1, 1, 2, '#2e2a2a')
  if (steam) {
    const phase = Math.floor(now / 250) % 2
    px(ctx, x + 1 + phase, y - 2, 1, 1, '#ffffff')
    px(ctx, x + 2 - phase, y - 4, 1, 1, '#ffffff')
  }
}

/** 서 있는 사람의 머리 꼭대기 y(발 위치 기준) */
function standingHeadTop(feetY: number) {
  return feetY - STAND_FEET_ROW + HEAD_Y + 1
}

/** 빈자리 위 상태 표지(말풍선) 왼쪽 위. 창가 쪽은 의자 등받이 위, 통로 쪽은 의자 위에 뜬다. */
function badgeOrigin(seat: SceneSeat) {
  return { x: seat.x - BADGE_SIZE / 2, y: seat.row === 'window' ? seat.spriteY + 1 : seat.spriteY + 5 }
}

/** 빈자리에 뜨는 상태 표지. 흰 말풍선 안에 도트 아이콘을 넣고, 움직일 때는 천천히 떠오른다. */
function drawAbsenceBadge(ctx: Ctx, seat: SceneSeat, kind: PresenceKind, now: number, animate: boolean) {
  const origin = badgeOrigin(seat)
  const bob = animate && Math.floor((now + seat.seatIndex * 370) / 700) % 2 === 1 ? -1 : 0
  const x = origin.x
  const y = origin.y + bob
  const size = BADGE_SIZE
  px(ctx, x + 1, y, size - 2, size, INK)
  px(ctx, x, y + 1, size, size - 2, INK)
  px(ctx, x + 1, y + 1, size - 2, size - 2, '#fbfbf7')
  // 꼬리(의자를 가리킨다)
  px(ctx, x + size / 2 - 2, y + size, 4, 1, INK)
  px(ctx, x + size / 2 - 1, y + size - 1, 2, 1, '#fbfbf7')
  px(ctx, x + size / 2 - 1, y + size + 1, 2, 1, INK)
  paintGrid(ctx, pixelIconGrid(kind), x + 2, y + 2)
}

/** 창으로 들어와 바닥에 떨어지는 햇빛(창 칸마다 비스듬한 빛 띠). 해가 낮을수록 길고 비스듬하다. */
function drawWindowLight(ctx: Ctx, sky: SkyState) {
  if (!sky.sun || sky.beamAlpha < 0.01) return
  const top = BIG_WINDOW.y + BIG_WINDOW.h + 17
  const length = Math.round(18 + 34 * Math.pow(1 - sky.sun.altitude, 1.4))
  const slant = (0.5 - sky.sun.x) * 1.3
  const color = rgbText([255, 244, 214], sky.beamAlpha)
  const panes: ReadonlyArray<readonly [number, number]> = [[292, 322], [327, 357], [362, 392], [397, 426]]
  for (const [left, right] of panes) {
    for (let row = 0; row < length; row += 1) {
      const shift = Math.round(row * slant)
      const fade = row > length - 6 ? (length - row) / 6 : 1
      if (fade < 1) ctx.globalAlpha = fade
      px(ctx, left + shift, top + row, right - left, 1, color)
      ctx.globalAlpha = 1
    }
  }
}

/** 겹친 원으로 만든 도트 불빛 웅덩이(가운데가 가장 밝다) */
function lightPool(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string) {
  for (const scale of [1, 0.72, 0.44]) {
    const radiusY = Math.max(1, Math.round(ry * scale))
    const radiusX = Math.max(1, Math.round(rx * scale))
    for (let dy = -radiusY; dy <= radiusY; dy += 1) {
      const half = Math.round(radiusX * Math.sqrt(Math.max(0, 1 - (dy * dy) / ((radiusY + 0.5) * (radiusY + 0.5)))))
      px(ctx, cx - half, cy + dy, half * 2 + 1, 1, color)
    }
  }
}

/**
 * 시간대 실내 빛: 저녁·밤에는 실내를 조금 어둡게(창밖 제외) 하고, 천장 등·플로어 스탠드 불빛을 얹는다.
 * 낮에는 아무것도 하지 않는다.
 */
function drawAmbientLight(ctx: Ctx, sky: SkyState) {
  if (sky.ambientAlpha < 0.01) return
  ctx.save()
  // 창밖 하늘만 빼고 칠한다. 유리 앞에 선 소품(커피 머신·정수기 등)은 실내라 함께 어두워진다.
  ctx.beginPath()
  ctx.rect(WORLD_LEFT, WORLD_TOP, WORLD_WIDTH, WORLD_HEIGHT)
  ctx.rect(BIG_WINDOW.x, BIG_WINDOW.y, BIG_WINDOW.w, BIG_WINDOW.h)
  for (const area of WINDOW_FRONT_AREAS) ctx.rect(area.x, area.y, area.w, area.h)
  ctx.clip('evenodd')
  ctx.globalCompositeOperation = 'multiply'
  px(ctx, WORLD_LEFT, WORLD_TOP, WORLD_WIDTH, WORLD_HEIGHT, rgbText(sky.ambient, Math.min(1, sky.ambientAlpha * 1.6)))
  const lamps = Math.max(0, Math.min(1, (sky.ambientAlpha - 0.06) / 0.12))
  if (lamps > 0) {
    ctx.globalCompositeOperation = 'screen'
    const warm = `rgba(255, 207, 122, ${(0.1 * lamps).toFixed(3)})`
    const cool = `rgba(232, 238, 255, ${(0.06 * lamps).toFixed(3)})`
    lightPool(ctx, LOUNGE_LAMP.x, LOUNGE_LAMP.y - 4, 28, 15, warm)
    lightPool(ctx, LOUNGE_LAMP.x, 74, 7, 4, `rgba(255, 226, 150, ${(0.3 * lamps).toFixed(3)})`)
    lightPool(ctx, 150, 86, 46, 24, cool)
    lightPool(ctx, 234, 86, 46, 24, cool)
    lightPool(ctx, (MEETING_ROOM.left + MEETING_ROOM.right) / 2, 206, 40, 26, cool)
  }
  ctx.restore()
}

export function createOfficeRenderer(
  target: HTMLCanvasElement,
  options: { onBubblesChange?: (bubbles: OfficeBubble[]) => void } = {},
): OfficeRenderer | null {
  const targetCtx = target.getContext('2d')
  if (!targetCtx) return null
  // 월드 전체(천장 띠·양옆·아래쪽 포함)를 한 장에 그리고, 카메라 영역만 화면에 옮긴다.
  // 책상 섬 층은 원래 장면 크기라 장면 좌표(0,0)에 그대로 얹는다.
  const frame = createLayer(WORLD_WIDTH, WORLD_HEIGHT)
  const background = createLayer(WORLD_WIDTH, WORLD_HEIGHT)
  const windowOverlay = createLayer(WORLD_WIDTH, WORLD_HEIGHT)
  const islandBack = createLayer()
  const islandFront = createLayer()
  const sky = createSkyPainter(BIG_WINDOW)
  if (!frame || !background || !windowOverlay || !islandBack || !islandFront || !sky) return null

  /** 한 번만 그려 두는 층(벽·바닥, 창틀·창가 소품, 책상 섬 뒤쪽). GPU 컨텍스트가 복원되면 다시 그린다. */
  const paintStatic = () => {
    for (const layer of [background, windowOverlay]) {
      layer.ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
      layer.ctx.save()
      layer.ctx.translate(-WORLD_LEFT, -WORLD_TOP)
    }
    drawBackground(background.ctx)
    drawBigWindowFrame(windowOverlay.ctx)
    drawWindowFrontProps(windowOverlay.ctx)
    for (const layer of [background, windowOverlay]) layer.ctx.restore()
    islandBack.ctx.clearRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT)
    drawIslandBack(islandBack.ctx)
  }
  paintStatic()

  let camera: OfficeCamera = CORE_CAMERA
  let attendees: number[] = []
  /** 자리를 비운 사람(자리 번호 → 상태) */
  let absences = new Map<number, PresenceKind>()
  /** 회의실에서 선 자리(자리 번호 → MEETING_SPOTS 번호). 이미 선 사람은 새 사람이 와도 자리를 옮기지 않는다. */
  const roomSpots = new Map<number, number>()
  let actors: Actor[] = []
  let deskPiles = new Map<number, 0 | 1 | 2 | 3>()
  let lastSky: SkyState | null = null
  const spriteCache = new Map<string, HTMLCanvasElement | null>()
  let bubbles: Array<OfficeBubble & { until: number }> = []
  let bubbleSeq = 0
  let nextChatterAt = 0
  let nextTripAt = 0
  const tripRandom = seededRandom(Math.floor(Math.random() * 0x7fffffff))

  /** 책상 섬 앞쪽(모니터·키보드 등)은 앉은 사람에 따라 달라서 자리 배치가 바뀔 때 다시 그린다. */
  const repaintFront = () => {
    islandFront.ctx.clearRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT)
    drawIslandFront(islandFront.ctx, actors.map((entry) => ({ seatIndex: entry.seat.seatIndex, look: entry.character.look })))
  }

  // 절전 복귀·그래픽 드라이버 재설정 등으로 캔버스 컨텍스트가 유실됐다 복원되면 캔버스가 비어 있다.
  // 매 장 새로 그리지 않는 층과 스프라이트·하늘 캐시를 다시 만든다.
  const layerCanvases = [frame, background, windowOverlay, islandBack, islandFront].map((layer) => layer.canvas)
  const onContextRestored = () => {
    paintStatic()
    repaintFront()
    spriteCache.clear()
    sky.invalidate()
  }
  for (const canvas of layerCanvases) canvas.addEventListener('contextrestored', onContextRestored)

  const publishBubbles = () => {
    options.onBubblesChange?.(bubbles.map(({ id, seatIndex, text }) => ({ id, seatIndex, text })))
  }

  const cached = (key: string, build: () => HTMLCanvasElement | null) => {
    let image = spriteCache.get(key)
    if (image === undefined) {
      image = build()
      if (spriteCache.size > 800) spriteCache.clear()
      spriteCache.set(key, image)
    }
    return image
  }

  const seatedSprite = (entry: Actor, pose: ActorPose) => {
    const { look } = entry.character
    const key = `sit|${entry.character.seed}|${look.gender}|${entry.seat.view}|${pose.pose}|${pose.frame}|${pose.expression}|${pose.headDrop}`
    return cached(key, () => gridToCanvas(composeSeatedSprite(look, {
      view: entry.seat.view,
      pose: pose.pose,
      frame: pose.frame,
      expression: pose.expression,
      headDrop: pose.headDrop,
    })))
  }

  const standingSprite = (entry: Actor, pose: StandingFrame) => {
    const { look } = entry.character
    const key = `stand|${entry.character.seed}|${look.gender}|${pose.facing}|${pose.pose}|${pose.frame}|${pose.held}|${pose.expression}`
    return cached(key, () => gridToCanvas(composeStandingSprite(look, pose)))
  }

  const isAway = (entry: Actor) => absences.has(entry.seat.seatIndex)

  const say = (entry: Actor, now: number, lines: readonly string[]) => {
    if (isAway(entry)) return
    if (bubbles.length >= MAX_BUBBLES || bubbles.some((bubble) => bubble.seatIndex === entry.seat.seatIndex)) return
    const text = lines[Math.floor(entry.actor.random() * lines.length)]
    bubbleSeq += 1
    bubbles = [...bubbles, { id: bubbleSeq, seatIndex: entry.seat.seatIndex, text, until: now + BUBBLE_DURATION }]
    publishBubbles()
  }

  /** 앉아 있는 사람 하나를 골라 다녀오게 한다. 여러 사람이 한꺼번에 비우지 않게 동시 인원을 제한한다. */
  const startTrip = (now: number) => {
    const inMeeting = new Set(attendees)
    const present = actors.filter((entry) => !isAway(entry))
    const wandering = present.filter((entry) => entry.trip && entry.trip.destination !== 'room').length
    const seated = present.filter((entry) => !entry.trip && !inMeeting.has(entry.seat.seatIndex))
    const free = present.length - inMeeting.size
    const limit = free <= 3 ? 1 : 2
    if (seated.length === 0 || wandering >= limit) return
    const busy = new Set<TripDestination>(
      actors.flatMap((entry) => (entry.trip && entry.trip.destination !== 'room' ? [entry.trip.destination] : [])),
    )
    const entry = seated[Math.floor(tripRandom() * seated.length)]
    const destination = chooseDestination(entry.character.personality.id, busy, tripRandom, isWorldCamera(camera))
    if (!destination) return
    entry.trip = planTrip(entry.seat.seatIndex, destination, now)
  }

  /**
   * 회의에 들어간 사람은 회의실 자리로 보내고, 빠진 사람은 돌려보낸다.
   * 다른 곳에 다녀오는 중이면 돌아온 뒤에 회의실로 간다. 동작 줄이기면 걷지 않고 바로 그 자리에 둔다.
   */
  const syncMeeting = (now: number, animate: boolean) => {
    const joined = new Set(attendees)
    for (const seatIndex of [...roomSpots.keys()]) if (!joined.has(seatIndex)) roomSpots.delete(seatIndex)
    for (const seatIndex of attendees) {
      if (roomSpots.has(seatIndex)) continue
      const taken = new Set(roomSpots.values())
      const free = MEETING_SPOTS.findIndex((_, index) => !taken.has(index))
      if (free >= 0) roomSpots.set(seatIndex, free)
    }
    for (const entry of actors) {
      const spot = roomSpots.get(entry.seat.seatIndex)
      const trip = entry.trip
      if (spot === undefined) {
        if (trip?.destination === 'room' && trip.phase !== 'back' && trip.phase !== 'settle') {
          if (animate) releaseTrip(trip, now)
          else entry.trip = null
        }
        continue
      }
      if (trip && trip.destination !== 'room') {
        // 다른 곳에 다녀오는 중이면: 막 일어나는 중이면 도로 앉히고, 도착해 있으면 거기서 바로 회의실로 간다.
        if (!animate) entry.trip = null
        else if (trip.phase === 'rise') releaseTrip(trip, now)
        else redirectToMeeting(trip, spot, now)
        if (entry.trip) continue
      }
      // 돌아오는 중이면 자리에 앉은 뒤 다시 회의실로 간다(순간 이동하지 않는다).
      if (entry.trip) continue
      const next = planMeetingTrip(entry.seat.seatIndex, spot, now)
      if (!next) continue
      if (!animate) {
        const target = MEETING_SPOTS[spot]
        next.phase = 'stay'
        next.phaseStartedAt = now
        next.phaseEndsAt = Infinity
        next.position = { x: target.x, y: target.y }
        next.pathIndex = next.path.length
        next.facing = target.facing
      }
      entry.trip = next
    }
  }

  const renderer: OfficeRenderer = {
    setDeskPiles(piles) { deskPiles = piles },
    announceWork(seatIndex, now) {
      if (prefersReducedMotion() || absences.has(seatIndex) || attendees.includes(seatIndex) || bubbles.length >= MAX_BUBBLES || bubbles.some(b => b.seatIndex === seatIndex)) return
      bubbleSeq += 1
      bubbles = [...bubbles, { id: bubbleSeq, seatIndex, text: '새 업무예요', until: now + 6000 }]
      publishBubbles()
    },
    deliverPaper(seatIndex, now) {
      if (prefersReducedMotion()) return
      const entry = actors.find(a => a.seat.seatIndex === seatIndex)
      const present = actors.filter(a => !isAway(a))
      const limit = present.length - attendees.length <= 3 ? 1 : 2
      if (!entry || entry.trip || isAway(entry) || attendees.includes(seatIndex) || present.filter(a => a.trip && a.trip.destination !== 'room').length >= limit || actors.some(a => a.trip?.destination === 'kanban')) return
      const trip = planTrip(seatIndex, 'kanban', now)
      if (trip) { trip.held = 'paper'; entry.trip = trip }
    },
    setOccupants(occupants) {
      const now = performance.now()
      const bySeat = new Map(SCENE_SEATS.map((seat) => [seat.seatIndex, seat]))
      const previous = new Map(actors.map((entry) => [`${entry.seat.seatIndex}|${entry.character.seed}|${entry.character.look.gender}`, entry]))
      actors = occupants.flatMap((occupant) => {
        const seat = bySeat.get(occupant.seatIndex)
        if (!seat) return []
        const kept = previous.get(`${occupant.seatIndex}|${occupant.character.seed}|${occupant.character.look.gender}`)
        if (kept) return [{ ...kept, character: occupant.character }]
        return [{
          seat,
          character: occupant.character,
          actor: createActor(occupant.character.personality.id, occupant.character.seed + occupant.seatIndex * 101, now),
          trip: null,
        }]
      })
      repaintFront()
      const seated = new Set(actors.map((entry) => entry.seat.seatIndex))
      const remaining = bubbles.filter((bubble) => seated.has(bubble.seatIndex))
      if (remaining.length !== bubbles.length) {
        bubbles = remaining
        publishBubbles()
      }
    },

    setViewport(next) {
      target.width = Math.max(1, Math.round(next.canvasWidth))
      target.height = Math.max(1, Math.round(next.canvasHeight))
    },

    setCamera(next) {
      camera = next
    },

    setMeeting(seats) {
      attendees = [...new Set(seats)].sort((left, right) => left - right)
    },

    setAbsences(next) {
      absences = new Map(next.map((absence) => [absence.seatIndex, absence.kind]))
      // 자리를 비우면 다녀오던 길도 그만둔다(회의실에 들어간 사람은 회의가 정한다).
      for (const entry of actors) {
        if (absences.has(entry.seat.seatIndex) && entry.trip && entry.trip.destination !== 'room') entry.trip = null
      }
      const remaining = bubbles.filter((bubble) => !absences.has(bubble.seatIndex))
      if (remaining.length !== bubbles.length) {
        bubbles = remaining
        publishBubbles()
      }
    },

    draw(now, { animate, clock }) {
      syncMeeting(now, animate)
      if (animate) {
        for (const entry of actors) {
          if (entry.trip) {
            const event = advanceTrip(entry.trip, now)
            if (event === 'arrived' && entry.actor.random() < ARRIVAL_BUBBLE_CHANCE) {
              const lines = entry.trip.destination === 'window' && lastSky
                ? WINDOW_LINES[lastSky.period]
                : TRIP_LINES[entry.trip.destination]
              say(entry, now, lines)
            }
            if (event === 'returned') {
              entry.trip = null
              entry.actor.action = 'type'
              entry.actor.startedAt = now
              entry.actor.endsAt = now + 3000 + Math.round(entry.actor.random() * 4000)
            }
            continue
          }
          if (isAway(entry)) continue
          const started = advanceActor(entry.actor, now)
          const chance = started ? ACTION_BUBBLE_CHANCE[started] : undefined
          if (chance && entry.actor.random() < chance) say(entry, now, entry.character.personality.lines)
        }
        if (nextTripAt === 0) nextTripAt = now + 5000 + tripRandom() * 5000
        if (now >= nextTripAt) {
          startTrip(now)
          nextTripAt = now + TRIP_GAP[0] + tripRandom() * (TRIP_GAP[1] - TRIP_GAP[0])
        }
        if (nextChatterAt === 0) nextChatterAt = now + 4000
        const talkers = actors.filter((entry) => !isAway(entry))
        if (now >= nextChatterAt && talkers.length > 0) {
          const speaker = talkers[Math.floor(tripRandom() * talkers.length)]
          say(speaker, now, speaker.character.personality.lines)
          nextChatterAt = now + CHATTER_GAP[0] + tripRandom() * (CHATTER_GAP[1] - CHATTER_GAP[0])
        }
        const alive = bubbles.filter((bubble) => bubble.until > now)
        if (alive.length !== bubbles.length) {
          bubbles = alive
          publishBubbles()
        }
      } else {
        // 동작 줄이기: 회의실에 있는 사람만 그 자리에 두고 나머지는 모두 앉힌다.
        for (const entry of actors) if (entry.trip?.destination !== 'room') entry.trip = null
        if (bubbles.length > 0) {
          bubbles = []
          publishBubbles()
        }
      }

      const ctx = frame.ctx
      ctx.drawImage(background.canvas, 0, 0)
      ctx.save()
      ctx.translate(-WORLD_LEFT, -WORLD_TOP)
      // 통창 밖 하늘 → 창틀·창가 소품 → 바닥에 떨어진 햇빛
      const skyState = sky.paint(ctx, clock.hour + clock.minute / 60, now, animate)
      lastSky = skyState
      ctx.drawImage(windowOverlay.canvas, WORLD_LEFT, WORLD_TOP)
      drawWindowLight(ctx, skyState)
      drawClockHands(ctx, clock.hour, clock.minute)
      drawNoticeContent(ctx, animate ? Math.floor(now / 4000) : 0)
      drawPrinterPaper(ctx, printerProgress(actors.flatMap((entry) => (entry.trip ? [entry.trip] : [])), now))

      const poses = new Map<Actor, ActorPose>()
      for (const entry of actors) {
        if (!entry.trip && !isAway(entry)) poses.set(entry, animate ? actorPose(entry.actor, now, entry.seat.view) : staticPose())
      }
      const bySeat = new Map(actors.map((entry) => [entry.seat.seatIndex, entry]))

      // 바닥 y가 작은(뒤쪽) 것부터 그린다. 같은 줄의 의자·앉은 사람·책상은 한 묶음이다.
      const layers: Array<{ baseY: number; order: number; paint: () => void }> = []
      for (const seat of SCENE_SEATS) {
        const entry = bySeat.get(seat.seatIndex)
        const pose = entry ? poses.get(entry) : undefined
        const image = entry && pose ? seatedSprite(entry, pose) : null
        if (seat.row === 'window') {
          layers.push({
            baseY: WINDOW_CHAIR_BASE_Y,
            order: 0,
            paint: () => {
              drawWindowChair(ctx, seat)
              if (image) ctx.drawImage(image, seat.spriteX, seat.spriteY)
            },
          })
        } else {
          layers.push({
            baseY: AISLE_CHAIR_BASE_Y,
            order: 0,
            paint: () => {
              if (image) ctx.drawImage(image, seat.spriteX, seat.spriteY)
              drawAisleChair(ctx, seat)
            },
          })
        }
      }
      layers.push({
        baseY: ISLAND_BASE_Y,
        order: 0,
        paint: () => {
          ctx.drawImage(islandBack.canvas, 0, 0)
          // 창가 쪽 줄 손은 책상 위에 올라와야 하므로 몸통 아래쪽(손)만 한 번 더 그린다.
          for (const entry of actors) {
            const pose = poses.get(entry)
            if (entry.seat.row !== 'window' || !pose) continue
            const image = seatedSprite(entry, pose)
            if (!image) continue
            const handTop = TABLE_FAR_Y - entry.seat.spriteY
            ctx.drawImage(image, 0, handTop, image.width, image.height - handTop, entry.seat.spriteX, TABLE_FAR_Y, image.width, image.height - handTop)
          }
          // 휴가·출장이면 책상을 치워 머그컵이 없다(잠깐 비운 자리는 그대로 둔다).
          const drawMugs = (row: SceneSeat['row']) => {
            for (const entry of actors) {
              const pose = poses.get(entry)
              const away = absences.get(entry.seat.seatIndex)
              if (entry.seat.row !== row || pose?.pose === 'sip' || away === 'vacation' || away === 'trip') continue
              drawDeskMug(ctx, entry.seat, entry.character.look.mug, animate && pose?.effect === 'steam', now)
            }
          }
          drawMugs('window')
          ctx.drawImage(islandFront.canvas, 0, 0)
          const screenTick = animate ? Math.floor(now / 600) : 0
          for (const entry of actors) {
            if (entry.seat.row !== 'aisle') continue
            const away = absences.get(entry.seat.seatIndex)
            if (away && !entry.trip) {
              drawScreenAway(ctx, entry.seat, away === 'vacation' || away === 'trip' ? 'off' : 'lock')
              continue
            }
            const pose = poses.get(entry)
            drawScreen(ctx, entry.seat, entry.character.look.screen, pose?.typing ? screenTick : 0, Boolean(pose?.typing))
          }
          drawMugs('aisle')
        },
      })
      // 사람 앞뒤로 오가는 기물: 회의실 유리벽·테이블, 출입 기록부 받침대
      layers.push({ baseY: MEETING_BACK_BASE_Y, order: 0, paint: () => drawMeetingBackGlass(ctx) })
      layers.push({ baseY: MEETING_TABLE_BASE_Y, order: 0, paint: () => drawMeetingTable(ctx) })
      layers.push({ baseY: LOGBOOK_BASE_Y, order: 0, paint: () => drawLogbookPodium(ctx) })
      layers.push({ baseY: MEETING_FRONT_BASE_Y, order: 2, paint: () => drawMeetingFrontGlass(ctx) })
      for (const entry of actors) {
        const trip = entry.trip
        if (!trip) continue
        const image = standingSprite(entry, tripPose(trip, now))
        layers.push({
          baseY: trip.position.y,
          order: 1,
          paint: () => {
            if (image) ctx.drawImage(image, Math.round(trip.position.x) - 10, Math.round(trip.position.y) - STAND_FEET_ROW)
          },
        })
      }
      layers.sort((left, right) => left.baseY - right.baseY || left.order - right.order)
      for (const layer of layers) layer.paint()
      for (const [seatIndex, level] of deskPiles) {
        const seat = SCENE_SEATS.find(s => s.seatIndex === seatIndex)
        if (!seat) continue
        for (let i = 0; i < level; i++) paintGrid(ctx, DESK_PAPERS, seat.x + 8, (seat.row === 'window' ? 64 : 88) - i * 2)
      }

      if (animate) {
        for (const entry of actors) {
          const pose = poses.get(entry)
          if (pose) drawEffect(ctx, entry.seat, pose, now)
        }
      }
      drawAmbientLight(ctx, skyState)
      // 저녁·밤에는 켜진 모니터가 스스로 빛난다(조명을 받지 않게 다시 그린다).
      if (skyState.ambientAlpha > 0.08) {
        const screenTick = animate ? Math.floor(now / 600) : 0
        for (const entry of actors) {
          const pose = poses.get(entry)
          if (entry.seat.row !== 'aisle' || !pose) continue
          drawScreen(ctx, entry.seat, entry.character.look.screen, pose.typing ? screenTick : 0, Boolean(pose.typing))
        }
      }
      // 상태 표지는 조명을 받지 않고 또렷하게 보인다.
      for (const entry of actors) {
        const away = absences.get(entry.seat.seatIndex)
        if (away && !entry.trip) drawAbsenceBadge(ctx, entry.seat, away, now, animate)
      }
      ctx.restore()

      // 카메라 영역만 옮긴다. 카드 폭에 맞춘 소수 배율이어도 한 칸을 흐리지 않고 그대로 늘린다(최근접 픽셀).
      targetCtx.imageSmoothingEnabled = false
      targetCtx.clearRect(0, 0, target.width, target.height)
      targetCtx.drawImage(
        frame.canvas,
        camera.x - WORLD_LEFT,
        camera.y - WORLD_TOP,
        camera.width,
        camera.height,
        0,
        0,
        target.width,
        target.height,
      )
    },

    anchors() {
      return actors.map((entry) => {
        const trip = entry.trip
        if (trip) {
          const feetY = Math.round(trip.position.y)
          return {
            seatIndex: entry.seat.seatIndex,
            x: Math.round(trip.position.x),
            headTop: standingHeadTop(feetY),
            bottom: feetY,
            standing: true,
            labelBelowY: null,
          }
        }
        const seat = entry.seat
        const away = absences.has(seat.seatIndex)
        return {
          seatIndex: seat.seatIndex,
          x: seat.x,
          headTop: away ? badgeOrigin(seat).y : seat.headTopY,
          bottom: seat.row === 'window' ? TABLE_FAR_Y : seat.spriteY + 26,
          standing: false,
          labelBelowY: seat.row === 'aisle' ? seat.labelY : null,
        }
      })
    },

    skyPeriod() {
      return lastSky?.period ?? '낮'
    },

    destroy() {
      for (const canvas of layerCanvases) canvas.removeEventListener('contextrestored', onContextRestored)
      actors = []
      spriteCache.clear()
      bubbles = []
    },
  }
  return renderer
}
