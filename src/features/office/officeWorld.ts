import { WORLD_BOTTOM, WORLD_LEFT, WORLD_RIGHT } from './officeGeometry'

/**
 * 사무실 구역별 기물(원래 장면 밖 포함). 좌표는 원래 장면과 같은 월드 좌표(논리 픽셀)다.
 * - 뒤쪽 벽: 왼쪽에 파트원 명패 보드·검토 통계 모니터·변경관리 문서함, 가운데 벽돌 벽, 오른쪽은 큰 통창
 * - 통창 앞: 창가 바(커피 머신·정수기·높은 의자)와 창가 라운지(소파·플로어 스탠드)
 * - 아래 왼쪽: 유리벽 작은 회의실(인스턴트 회의)과 복합기 코너
 * - 아래 가운데: 출입구(출입 게이트·출입 기록부·위생복 걸이) / 아래 오른쪽: 제품 샘플 보관장·업무 분장표
 */

type Ctx = CanvasRenderingContext2D

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

function disc(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string) {
  for (let dy = -ry; dy <= ry; dy += 1) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5)))))
    rect(ctx, cx - half, cy + dy, half * 2 + 1, 1, color)
  }
}

// ── 큰 통창 ──────────────────────────────────────────────

/** 통창 유리 안쪽(하늘이 보이는 곳). 바닥까지 내려오는 창이라 창턱 바로 위까지 유리다. */
export const BIG_WINDOW = { x: 290, y: -9, w: 138, h: 45 } as const
/** 창살(세로) 위치. 창을 네 칸으로 나눈다. */
const MULLIONS = [324, 359, 394] as const

/** 창틀·창살·창턱·유리 반사. 하늘을 그린 뒤에 얹는다. */
export function drawBigWindowFrame(ctx: Ctx) {
  const { x, y, w, h } = BIG_WINDOW
  const frame = '#3a3f48'
  const frameLight = '#5b6069'
  rect(ctx, x - 2, y - 2, w + 4, 2, frame)
  rect(ctx, x - 2, y, 2, h, frame)
  rect(ctx, x + w, y, 2, h, frame)
  for (const mx of MULLIONS) {
    rect(ctx, mx - 1, y, 2, h, frame)
    rect(ctx, mx - 1, y, 1, h, frameLight)
  }
  // 유리 반사(창 칸마다 비스듬한 옅은 빛줄기 하나)
  for (const [startX, length] of [[x + 8, 10], [x + 80, 12]] as const) {
    for (let step = 0; step < length; step += 1) {
      rect(ctx, startX + step, y + 3 + step, 2, 1, 'rgba(255, 255, 255, 0.1)')
    }
  }
  // 창턱
  rect(ctx, x - 3, y + h, w + 6, 2, '#e4e0d8')
  rect(ctx, x - 3, y + h + 2, w + 6, 1, '#bdb8ae')
  // 양옆에 묶어 둔 커튼
  for (const cx of [x - 7, x + w + 2]) {
    rect(ctx, cx, y - 1, 5, h - 2, '#c9d3e0')
    rect(ctx, cx + 1, y - 1, 1, h - 2, '#dde4ee')
    rect(ctx, cx + 3, y - 1, 1, h - 2, '#b3bfcf')
    rect(ctx, cx - 1, y + 20, 7, 2, '#8e6541')
  }
  rect(ctx, x - 9, y - 3, w + 18, 1, '#8f959e')
}

/** 창 쪽 벽(창틀 둘레). 하늘보다 먼저, 벽과 함께 그린다. */
function drawWindowWall(ctx: Ctx) {
  const { x, y, w, h } = BIG_WINDOW
  // 하늘이 그려질 자리(유리)는 어두운 색으로 비워 둔다.
  rect(ctx, x, y, w, h, '#1d2027')
}

/** 창가 바: 창 아래 긴 조리대와 높은 의자 셋(사람보다 늘 뒤) */
function drawWindowBar(ctx: Ctx) {
  const left = BIG_WINDOW.x + 2
  const width = BIG_WINDOW.w - 4
  rect(ctx, left, 40, width, 4, '#caa07a')
  rect(ctx, left, 40, width, 1, '#dcb58f')
  rect(ctx, left, 44, width, 8, '#8e6541')
  rect(ctx, left, 44, width, 1, '#6b4a2f')
  for (let panel = left + 22; panel < left + width - 4; panel += 23) rect(ctx, panel, 45, 1, 7, '#7a5638')
  rect(ctx, left, 52, width, 2, '#c9ab80')
  for (const stoolX of [328, 376, 398]) {
    rect(ctx, stoolX - 3, 54, 7, 2, '#3b424e')
    rect(ctx, stoolX - 3, 54, 7, 1, '#566174')
    rect(ctx, stoolX, 56, 1, 4, '#8f959e')
    rect(ctx, stoolX - 2, 60, 5, 1, '#5b6069')
  }
}

/** 유리 앞에 서 있는 소품이 유리를 가리는 곳(밤에 실내 조명을 받는 곳). drawWindowFrontProps와 맞춘다. */
export const WINDOW_FRONT_AREAS: ReadonlyArray<{ x: number; y: number; w: number; h: number }> = [
  { x: 296, y: 29, w: 13, h: BIG_WINDOW.y + BIG_WINDOW.h - 29 },
  { x: 361, y: 30, w: 8, h: BIG_WINDOW.y + BIG_WINDOW.h - 30 },
  { x: 413, y: 16, w: 12, h: BIG_WINDOW.y + BIG_WINDOW.h - 16 },
]

/** 조리대 위와 창 앞에 서 있는 것(하늘을 그린 뒤 다시 얹는다): 커피 머신, 작은 화분, 정수기 */
export function drawWindowFrontProps(ctx: Ctx) {
  // 에스프레소 머신
  rect(ctx, 296, 29, 13, 12, '#2e3138')
  rect(ctx, 297, 30, 11, 2, '#5b6069')
  rect(ctx, 300, 35, 5, 3, '#9aa0a8')
  rect(ctx, 306, 32, 1, 1, '#e2554b')
  rect(ctx, 299, 38, 7, 1, '#1d2027')
  // 머그컵 둘
  rect(ctx, 312, 37, 3, 3, '#ffcc3d')
  rect(ctx, 316, 37, 3, 3, '#f4f4f0')
  // 조리대 가운데 작은 화분
  rect(ctx, 362, 37, 7, 4, '#f3f1ec')
  rect(ctx, 362, 40, 7, 1, '#d4d0c7')
  rect(ctx, 361, 32, 4, 5, '#3f8a4f')
  rect(ctx, 365, 30, 4, 7, '#6cbf6d')
  rect(ctx, 363, 31, 2, 2, '#6cbf6d')
  // 정수기(바닥에 선다)
  rect(ctx, 413, 29, 12, 24, '#f3f4f6')
  rect(ctx, 413, 29, 12, 1, '#d4d7dc')
  rect(ctx, 424, 30, 1, 23, '#d4d7dc')
  rect(ctx, 414, 18, 10, 11, '#9fd0f2')
  rect(ctx, 415, 19, 2, 8, '#cfe8fa')
  rect(ctx, 416, 16, 6, 2, '#7fb4dc')
  rect(ctx, 415, 37, 2, 2, '#3d7bd8')
  rect(ctx, 420, 37, 2, 2, '#e2554b')
  rect(ctx, 414, 43, 10, 1, '#c4c7cc')
  rect(ctx, 413, 52, 12, 1, '#c4c7cc')
}

// ── 창가 라운지 ──────────────────────────────────────────

/** 플로어 스탠드 전등갓 아래(밤에 불빛이 고인다) */
export const LOUNGE_LAMP = { x: 398, y: 104 } as const

function drawLounge(ctx: Ctx) {
  // 러그
  rect(ctx, 300, 80, 126, 46, '#c7b299')
  rect(ctx, 302, 82, 122, 42, '#d6c3a8')
  for (let x = 306; x < 420; x += 8) rect(ctx, x, 82, 2, 42, '#cdb89c')
  rect(ctx, 302, 82, 122, 1, '#e0d0b8')
  // 소파(창을 등지고 사무실 쪽을 본다)
  rect(ctx, 334, 86, 56, 10, '#3f5f86')
  rect(ctx, 334, 86, 56, 1, '#5b7fa6')
  rect(ctx, 334, 96, 56, 9, '#4a6d96')
  rect(ctx, 334, 96, 56, 1, '#5b7fa6')
  rect(ctx, 331, 90, 4, 16, '#34506f')
  rect(ctx, 389, 90, 4, 16, '#34506f')
  rect(ctx, 340, 91, 10, 5, '#ffcc3d')
  rect(ctx, 374, 91, 10, 5, '#e8e8e4')
  rect(ctx, 361, 97, 1, 7, '#3f5f86')
  rect(ctx, 336, 105, 2, 2, '#26374c')
  rect(ctx, 386, 105, 2, 2, '#26374c')
  // 낮은 테이블(머그·잡지)
  rect(ctx, 346, 110, 32, 7, '#b8875a')
  rect(ctx, 346, 110, 32, 1, '#caa07a')
  rect(ctx, 348, 117, 2, 3, '#8e6541')
  rect(ctx, 374, 117, 2, 3, '#8e6541')
  rect(ctx, 351, 111, 4, 3, '#fbfbf7')
  rect(ctx, 352, 110, 2, 1, '#6b4a2f')
  rect(ctx, 360, 111, 11, 4, '#3d7bd8')
  rect(ctx, 361, 112, 9, 1, '#fbfbf7')
  // 플로어 스탠드
  rect(ctx, LOUNGE_LAMP.x - 5, 72, 11, 6, '#f3e7c9')
  rect(ctx, LOUNGE_LAMP.x - 5, 72, 11, 1, '#fff6dc')
  rect(ctx, LOUNGE_LAMP.x - 5, 77, 11, 1, '#d8c9a4')
  rect(ctx, LOUNGE_LAMP.x, 78, 1, 26, '#5b6069')
  rect(ctx, LOUNGE_LAMP.x - 3, 104, 7, 2, '#3a3f48')
}

// ── 회의실 ───────────────────────────────────────────────

/** 유리벽 회의실(바깥 테두리). 문은 위쪽 벽 가운데 오른쪽에 있다. */
export const MEETING_ROOM = { left: -40, right: 64, top: 160, bottom: 252, doorLeft: 22, doorRight: 38 } as const
/** 회의 테이블(서서 하는 높은 테이블)이 앞뒤 순서를 정하는 바닥 y */
export const MEETING_TABLE_BASE_Y = 214
/** 회의실 앞 유리 난간이 앞뒤 순서를 정하는 바닥 y */
export const MEETING_FRONT_BASE_Y = MEETING_ROOM.bottom
/** 회의실 뒤 유리벽이 앞뒤 순서를 정하는 바닥 y(복도를 지나는 사람은 유리 뒤로 비친다) */
export const MEETING_BACK_BASE_Y = MEETING_ROOM.top
/** 출입 기록부 받침대가 앞뒤 순서를 정하는 바닥 y */
export const LOGBOOK_BASE_Y = 236

const GLASS = 'rgba(190, 226, 246, 0.42)'
const GLASS_EDGE = '#8fb8d4'
const GLASS_SHINE = 'rgba(255, 255, 255, 0.55)'

function drawMeetingRoomFloor(ctx: Ctx) {
  const { left, right, top, bottom } = MEETING_ROOM
  rect(ctx, left, top, right - left, bottom - top, '#d9dee6')
  for (let y = top + 4; y < bottom; y += 8) {
    for (let x = left + ((y / 8) % 2 === 0 ? 0 : 8); x < right; x += 16) rect(ctx, x, y, 8, 1, '#cfd5de')
  }
  // 벽 쪽 걸레받이 그늘
  rect(ctx, left, top, right - left, 2, '#c3cad4')
  // 안쪽 벽 화면(회의용 모니터)
  rect(ctx, left + 8, top - 10, 30, 10, '#1d2027')
  rect(ctx, left + 9, top - 9, 28, 8, '#123463')
  rect(ctx, left + 11, top - 7, 12, 1, '#dce8ff')
  rect(ctx, left + 11, top - 5, 20, 1, '#8ea5c4')
  rect(ctx, left + 11, top - 3, 8, 1, '#ffcc3d')
  // 구석 화분
  rect(ctx, right - 12, bottom - 14, 8, 6, '#3a3f48')
  rect(ctx, right - 14, bottom - 22, 12, 8, '#3f8a4f')
  rect(ctx, right - 13, bottom - 22, 6, 1, '#6cbf6d')
}

/** 회의실 뒤 유리벽(문 틈 포함). 복도를 지나는 사람 앞에 반투명하게 그린다. */
export function drawMeetingBackGlass(ctx: Ctx) {
  const { left, right, top, doorLeft, doorRight } = MEETING_ROOM
  const height = 12
  for (const [from, to] of [[left, doorLeft], [doorRight, right]] as const) {
    rect(ctx, from, top - height, to - from, height, GLASS)
    rect(ctx, from, top - height, to - from, 1, GLASS_EDGE)
    rect(ctx, from, top - 1, to - from, 1, GLASS_EDGE)
    rect(ctx, from + 3, top - height + 2, 1, height - 4, GLASS_SHINE)
    rect(ctx, from + 5, top - height + 2, 1, height - 6, GLASS_SHINE)
  }
  // 문틀
  rect(ctx, doorLeft - 1, top - height, 1, height, '#6f8fa6')
  rect(ctx, doorRight, top - height, 1, height, '#6f8fa6')
  // 옆 유리벽
  rect(ctx, left, top - height, 1, MEETING_ROOM.bottom - top + height, GLASS_EDGE)
  rect(ctx, right - 1, top - height, 1, MEETING_ROOM.bottom - top + height, GLASS_EDGE)
}

/** 서서 하는 높은 회의 테이블(노트북·서류) */
export function drawMeetingTable(ctx: Ctx) {
  const x = -14
  const y = 198
  rect(ctx, x, y, 54, 10, '#f6f5f1')
  rect(ctx, x, y, 54, 1, '#e1dfd8')
  rect(ctx, x, y + 10, 54, 3, '#cfccc4')
  rect(ctx, x + 4, y + 13, 3, 3, '#8f959e')
  rect(ctx, x + 47, y + 13, 3, 3, '#8f959e')
  // 노트북·서류·펜
  rect(ctx, x + 6, y + 2, 10, 6, '#c7ccd3')
  rect(ctx, x + 7, y + 3, 8, 4, '#5fa8e8')
  rect(ctx, x + 22, y + 3, 8, 5, '#fbfbf7')
  rect(ctx, x + 23, y + 4, 6, 1, '#b8bcc2')
  rect(ctx, x + 23, y + 6, 4, 1, '#b8bcc2')
  rect(ctx, x + 36, y + 3, 7, 5, '#fbfbf7')
  rect(ctx, x + 37, y + 4, 5, 1, '#e2554b')
  rect(ctx, x + 46, y + 4, 4, 1, '#34497a')
}

/** 회의실 앞쪽 낮은 유리 난간(안이 들여다보인다) */
export function drawMeetingFrontGlass(ctx: Ctx) {
  const { left, right, bottom } = MEETING_ROOM
  rect(ctx, left, bottom - 8, right - left, 8, GLASS)
  rect(ctx, left, bottom - 8, right - left, 1, GLASS_EDGE)
  rect(ctx, left, bottom - 1, right - left, 1, '#6f8fa6')
  for (let x = left + 6; x < right - 4; x += 24) rect(ctx, x, bottom - 6, 1, 4, GLASS_SHINE)
}

// ── 벽 기물 ──────────────────────────────────────────────

/** 파트원 명패 보드(왼쪽 벽) */
function drawNameplateBoard(ctx: Ctx) {
  const x = -44
  const y = 6
  rect(ctx, x, y, 38, 28, '#8e6541')
  rect(ctx, x + 1, y + 1, 36, 26, '#d9b98c')
  rect(ctx, x + 3, y + 3, 32, 4, '#34497a')
  rect(ctx, x + 6, y + 4, 12, 1, '#fbfbf7')
  const colors = ['#3d7bd8', '#43b596', '#ffcc3d', '#e2554b', '#8a63d2', '#34497a']
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const px = x + 3 + col * 11
      const py = y + 10 + row * 6
      rect(ctx, px, py, 10, 4, '#fbfbf7')
      rect(ctx, px, py, 2, 4, colors[(row * 3 + col) % colors.length])
      rect(ctx, px + 3, py + 1, 5, 1, '#5b6069')
      rect(ctx, px + 3, py + 3, 10 - 4, 1, '#e8e8e4')
    }
  }
}

/** 검토 통계 모니터(왼쪽 벽): 월별 막대와 승인율 선 */
export const STATS_MONITOR = { x: 12, y: 5 } as const

function drawStatsMonitor(ctx: Ctx) {
  const { x, y } = STATS_MONITOR
  rect(ctx, x, y, 40, 28, '#1d2027')
  rect(ctx, x + 2, y + 2, 36, 23, '#0f1c33')
  rect(ctx, x + 2, y + 2, 36, 4, '#123463')
  rect(ctx, x + 4, y + 3, 10, 1, '#dce8ff')
  rect(ctx, x + 32, y + 3, 4, 2, '#43b596')
  const bars = [6, 9, 7, 12, 10, 14]
  bars.forEach((height, index) => {
    const bx = x + 5 + index * 5
    rect(ctx, bx, y + 23 - height, 3, height, index === bars.length - 1 ? '#ffcc3d' : '#3d7bd8')
  })
  const line = [[5, 14], [10, 12], [15, 13], [20, 10], [25, 9], [30, 7], [34, 8]]
  for (let index = 1; index < line.length; index += 1) {
    const [x0, y0] = line[index - 1]
    const [x1, y1] = line[index]
    for (let step = 0; step <= 4; step += 1) {
      const t = step / 4
      rect(ctx, x + Math.round(x0 + (x1 - x0) * t), y + Math.round(y0 + (y1 - y0) * t), 1, 1, '#43b596')
    }
  }
  rect(ctx, x + 18, y + 28, 4, 2, '#6b7079')
}

// ── 바닥 구역 ───────────────────────────────────────────

/** 업무 구역(책상 섬) 카펫. 벽 앞 복도부터 통로까지 깐다. */
function drawWorkCarpet(ctx: Ctx) {
  const left = 102
  const right = 284
  const top = 42
  const bottom = 128
  rect(ctx, left, top, right - left, bottom - top, '#a9b7c9')
  rect(ctx, left + 1, top + 1, right - left - 2, bottom - top - 2, '#bfcad8')
  for (let y = top + 3; y < bottom - 1; y += 4) {
    for (let x = left + 3 + ((y >> 2) % 2) * 2; x < right - 2; x += 4) rect(ctx, x, y, 1, 1, '#b3c0cf')
  }
}

/** 프로젝트 코너 원형 러그 */
function drawProjectRug(ctx: Ctx) {
  disc(ctx, 30, 90, 27, 11, '#b7c7b0')
  disc(ctx, 30, 90, 25, 9, '#c9d6c3')
}

/** 아래쪽 복도 러그: 회의실 문에서 샘플 보관장까지, 가운데에서 출입구로 이어진다(사람이 걷는 길). */
function drawHallRunner(ctx: Ctx) {
  const edge = '#9fb0ae'
  const fill = '#b6c2c1'
  const stripe = '#aebbba'
  rect(ctx, 20, 144, 372, 13, edge)
  rect(ctx, 21, 145, 370, 11, fill)
  rect(ctx, 21, 147, 370, 1, stripe)
  rect(ctx, 21, 153, 370, 1, stripe)
  rect(ctx, 196, 156, 22, 48, edge)
  rect(ctx, 197, 156, 20, 48, fill)
  rect(ctx, 199, 156, 1, 48, stripe)
  rect(ctx, 214, 156, 1, 48, stripe)
}

/** 출입구 돌바닥 */
function drawEntranceTiles(ctx: Ctx) {
  const left = 146
  const right = 276
  const top = 204
  rect(ctx, left, top, right - left, WORLD_BOTTOM - top, '#dcd8cf')
  for (let y = top; y < WORLD_BOTTOM; y += 8) rect(ctx, left, y, right - left, 1, '#c9c4b9')
  for (let y = top, row = 0; y < WORLD_BOTTOM; y += 8, row += 1) {
    for (let x = left + (row % 2 === 0 ? 0 : 8); x < right; x += 16) rect(ctx, x, y, 1, 8, '#c9c4b9')
  }
  rect(ctx, left, top, right - left, 1, '#bdb8ad')
}

// ── 아래쪽 기물 ─────────────────────────────────────────

/** 출입 게이트(사원증 단말기) */
function drawEntranceGate(ctx: Ctx) {
  // 발판
  rect(ctx, 178, 246, 56, 10, '#5b6069')
  rect(ctx, 178, 246, 56, 1, '#6b7079')
  for (let x = 182; x < 232; x += 6) rect(ctx, x, 249, 3, 5, '#4a4f58')
  // 기둥 둘
  for (const px of [184, 220]) {
    rect(ctx, px, 222, 8, 24, '#c9ccd2')
    rect(ctx, px, 222, 8, 2, '#e3e5e9')
    rect(ctx, px + 7, 224, 1, 22, '#a9aeb6')
  }
  // 유리 날개
  rect(ctx, 192, 230, 28, 7, 'rgba(190, 226, 246, 0.6)')
  rect(ctx, 192, 230, 28, 1, GLASS_EDGE)
  rect(ctx, 205, 230, 2, 7, GLASS_EDGE)
  // 카드 단말기(초록 불)
  rect(ctx, 221, 218, 6, 5, '#2e3138')
  rect(ctx, 222, 219, 4, 2, '#43b596')
  rect(ctx, 223, 222, 2, 1, '#9aa0a8')
}

/** 위생복 걸이(출입구 왼쪽) */
function drawCoatRack(ctx: Ctx) {
  const x = 156
  rect(ctx, x + 4, 214, 1, 34, '#5b6069')
  rect(ctx, x + 1, 214, 8, 1, '#5b6069')
  rect(ctx, x + 1, 247, 8, 1, '#5b6069')
  for (const coatX of [x, x + 5]) {
    rect(ctx, coatX, 216, 5, 16, '#fbfbf7')
    rect(ctx, coatX, 216, 5, 1, '#9fc3ea')
    rect(ctx, coatX + 2, 217, 1, 14, '#e1e4e8')
    rect(ctx, coatX, 231, 5, 1, '#d9dce1')
  }
}

/** 출입 기록부 받침대(펼친 기록부와 펜). 사람이 뒤에 서서 쓰므로 앞뒤 순서에 맞춰 그린다. */
export function drawLogbookPodium(ctx: Ctx) {
  rect(ctx, 245, 234, 20, 2, '#5b6069')
  rect(ctx, 248, 220, 14, 14, '#8e6541')
  rect(ctx, 249, 221, 1, 12, '#a47a52')
  rect(ctx, 244, 214, 22, 7, '#b8875a')
  rect(ctx, 244, 214, 22, 1, '#caa07a')
  // 펼친 기록부
  rect(ctx, 246, 212, 18, 5, '#fbfbf7')
  rect(ctx, 255, 212, 1, 5, '#d4d0c7')
  for (const lineY of [213, 215]) {
    rect(ctx, 247, lineY, 6, 1, '#9aa1ab')
    rect(ctx, 257, lineY, 6, 1, '#9aa1ab')
  }
  rect(ctx, 262, 211, 1, 4, '#34497a')
}

/** 복합기 코너: 받침장 위 복합기와 옆에 쌓은 용지 상자 */
export const PRINTER = { x: 97, y: 170 } as const

function drawPrinterCorner(ctx: Ctx) {
  const { x, y } = PRINTER
  // 받침장
  rect(ctx, x - 3, y + 16, 32, 16, '#c9ccd2')
  rect(ctx, x - 3, y + 16, 32, 1, '#e3e5e9')
  rect(ctx, x + 12, y + 17, 1, 15, '#a9aeb6')
  rect(ctx, x + 9, y + 22, 2, 1, '#5b6069')
  rect(ctx, x + 14, y + 22, 2, 1, '#5b6069')
  rect(ctx, x - 3, y + 31, 32, 1, '#8f959e')
  // 복합기
  rect(ctx, x, y + 8, 26, 9, '#c9ccd2')
  rect(ctx, x, y + 8, 26, 1, '#e3e5e9')
  rect(ctx, x + 1, y + 11, 24, 1, '#9aa0a8')
  rect(ctx, x - 1, y, 28, 8, '#dfe2e6')
  rect(ctx, x - 1, y, 28, 2, '#5b6069')
  rect(ctx, x + 18, y + 4, 6, 2, '#34495e')
  rect(ctx, x + 24, y + 4, 1, 1, '#43b596')
  rect(ctx, x + 1, y + 6, 13, 2, '#9aa0a8')
  // 용지 상자
  for (const [bx, by] of [[132, 190], [131, 182]] as const) {
    rect(ctx, bx, by, 12, 8, '#c9a36b')
    rect(ctx, bx, by, 12, 1, '#dcbc88')
    rect(ctx, bx + 5, by, 2, 8, '#b08a55')
  }
}

/** 복합기에서 나오는 출력물(0~1 진행도) */
export function drawPrinterPaper(ctx: Ctx, progress: number) {
  if (progress <= 0) return
  const { x, y } = PRINTER
  const length = Math.max(1, Math.round(Math.min(1, progress) * 6))
  rect(ctx, x + 2, y + 8 - length, 9, length, '#fbfbf7')
  rect(ctx, x + 3, y + 8 - length, 7, 1, '#b8bcc2')
}

/** 제품 샘플 보관장(안정성 시험 샘플, 온도 표시) */
function drawSampleCabinet(ctx: Ctx) {
  const x = 344
  const y = 158
  rect(ctx, x, y, 30, 48, '#e9edf1')
  rect(ctx, x, y, 30, 1, '#f7f9fb')
  rect(ctx, x + 29, y + 1, 1, 47, '#c3cad4')
  // 온도 표시
  rect(ctx, x + 3, y + 3, 14, 5, '#1d2027')
  rect(ctx, x + 5, y + 4, 2, 3, '#43b596')
  rect(ctx, x + 8, y + 4, 2, 3, '#43b596')
  rect(ctx, x + 12, y + 4, 3, 1, '#43b596')
  rect(ctx, x + 22, y + 4, 4, 3, '#3d7bd8')
  // 유리문과 선반의 바이알
  rect(ctx, x + 3, y + 10, 24, 34, '#cfe8fa')
  const tops = ['#e2554b', '#ffcc3d', '#3d7bd8', '#43b596', '#8a63d2']
  for (let shelf = 0; shelf < 4; shelf += 1) {
    const sy = y + 12 + shelf * 8
    for (let index = 0; index < 5; index += 1) {
      rect(ctx, x + 5 + index * 4, sy + 1, 2, 5, '#f7fbff')
      rect(ctx, x + 5 + index * 4, sy, 2, 1, tops[(index + shelf) % tops.length])
    }
    rect(ctx, x + 3, sy + 6, 24, 1, '#9fbfd6')
  }
  rect(ctx, x + 25, y + 22, 1, 8, '#5b6069')
  rect(ctx, x + 2, y + 46, 3, 2, '#5b6069')
  rect(ctx, x + 25, y + 46, 3, 2, '#5b6069')
  // 옆 샘플 카트
  rect(ctx, x - 14, y + 30, 11, 2, '#9aa0a8')
  rect(ctx, x - 14, y + 38, 11, 2, '#9aa0a8')
  rect(ctx, x - 13, y + 26, 3, 4, '#fbfbf7')
  rect(ctx, x - 9, y + 27, 3, 3, '#dff1fb')
  rect(ctx, x - 14, y + 32, 1, 12, '#8f959e')
  rect(ctx, x - 4, y + 32, 1, 12, '#8f959e')
}

/** 업무 분장표(이동식 보드, 사람별 칸) */
function drawDutyBoard(ctx: Ctx) {
  const x = 388
  const y = 158
  rect(ctx, x, y, 40, 38, '#9aa0a8')
  rect(ctx, x + 1, y + 1, 38, 36, '#fdfdfb')
  rect(ctx, x + 1, y + 1, 38, 5, '#e8edf4')
  rect(ctx, x + 3, y + 2, 12, 2, '#34497a')
  const cells = ['#dceeff', '#dff3e8', '#fff2cf', '#f8dfe1', '#e8edf4']
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const cx = x + 3 + col * 9
      const cy = y + 8 + row * 6
      rect(ctx, cx, cy, 8, 5, cells[(row + col * 2) % cells.length])
      if ((row + col) % 3 === 0) rect(ctx, cx + 1, cy + 2, 5, 1, '#5b6069')
    }
  }
  rect(ctx, x + 5, y + 38, 2, 6, '#8f959e')
  rect(ctx, x + 33, y + 38, 2, 6, '#8f959e')
  rect(ctx, x + 2, y + 44, 8, 1, '#5b6069')
  rect(ctx, x + 30, y + 44, 8, 1, '#5b6069')
}

function drawFloorPlant(ctx: Ctx, x: number, baseY: number) {
  rect(ctx, x + 3, baseY - 8, 12, 8, '#3a3f48')
  rect(ctx, x + 3, baseY - 8, 12, 1, '#555b66')
  const leaves = [[-3, -17], [5, -21], [11, -16], [1, -12], [9, -11], [4, -15]]
  for (const [lx, ly] of leaves) {
    rect(ctx, x + lx, baseY + ly, 8, 5, '#3f8a4f')
    rect(ctx, x + lx + 1, baseY + ly, 5, 1, '#6cbf6d')
    rect(ctx, x + lx, baseY + ly + 4, 8, 1, '#2d6b3b')
  }
}

/** 바닥 구역(카펫·러그·돌바닥). 바닥 무늬 바로 위, 가구보다 먼저 깐다. */
export function drawFloorZones(ctx: Ctx) {
  drawWorkCarpet(ctx)
  drawProjectRug(ctx)
  drawHallRunner(ctx)
  drawEntranceTiles(ctx)
}

/** 창 쪽 벽: 벽을 칠한 뒤 유리 자리를 비워 둔다. */
export function drawWindowWallBase(ctx: Ctx) {
  drawWindowWall(ctx)
}

/** 사람보다 늘 뒤에 있는 기물(벽 기물·바닥 가구). 벽·바닥은 drawBackground가 이미 월드 전체에 깔았다. */
export function drawWorldExtras(ctx: Ctx) {
  drawNameplateBoard(ctx)
  drawStatsMonitor(ctx)
  drawWindowBar(ctx)
  drawLounge(ctx)
  drawMenuBoard(ctx)
  drawMeetingRoomFloor(ctx)
  drawPrinterCorner(ctx)
  drawEntranceGate(ctx)
  drawCoatRack(ctx)
  drawSampleCabinet(ctx)
  drawDutyBoard(ctx)
  // 구역 모서리 화분(왼쪽 벽 앞, 라운지 끝, 출입구 옆, 오른쪽 아래 구석)
  drawFloorPlant(ctx, WORLD_LEFT + 6, 112)
  drawFloorPlant(ctx, 404, 132)
  drawFloorPlant(ctx, 270, WORLD_BOTTOM - 4)
  drawFloorPlant(ctx, WORLD_RIGHT - 26, WORLD_BOTTOM - 4)
}

/** 라운지 옆 원목 메뉴판. 종이와 요일 칸도 장면과 같은 정수 도트로 그린다. */
function drawMenuBoard(ctx: Ctx) {
  const x = 300
  const y = 80
  rect(ctx, x - 2, y + 32, 29, 2, '#b99d78')
  rect(ctx, x + 2, y + 25, 3, 8, '#8e6541')
  rect(ctx, x + 20, y + 25, 3, 8, '#8e6541')
  rect(ctx, x, y, 25, 28, '#6b4a2f')
  rect(ctx, x + 1, y + 1, 23, 26, '#caa07a')
  rect(ctx, x + 3, y + 3, 19, 21, '#fffdf6')
  rect(ctx, x + 8, y + 2, 9, 2, '#e2b84f')
  rect(ctx, x + 5, y + 6, 15, 3, '#3f5f86')
  for (let row = 0; row < 5; row += 1) {
    rect(ctx, x + 5, y + 11 + row * 2, 3, 1, '#c7744a')
    rect(ctx, x + 10, y + 11 + row * 2, 9 - row % 3, 1, '#9aa0a8')
  }
}
