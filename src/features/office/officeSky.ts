/**
 * 사무실 오른쪽 큰 통창 밖 하늘(서울 시각).
 * 하루를 몇 개의 기준 시각으로 나눠 색을 정하고, 그 사이는 분 단위로 섞어 아침 → 낮 → 오후 → 저녁 → 밤이
 * 자연스럽게 바뀐다. 해와 달은 왼쪽에서 떠 오른쪽으로 지고(남향 창), 밤에는 별과 건물 불빛이 켜진다.
 * 하늘·해·달·건물은 분마다 한 번 그려 두고, 구름·별 반짝임·남산타워 불빛만 장마다 다시 그린다.
 */

type Ctx = CanvasRenderingContext2D
type Rgb = readonly [number, number, number]

export type SkyPeriod = '새벽' | '아침' | '낮' | '오후' | '저녁' | '밤'

type SkyKeyframe = {
  hour: number
  top: string
  horizon: string
  cloud: string
  cloudShade: string
  mountain: string
  far: string
  near: string
  lit: string
  unlit: string
  sun: string
  /** 실내에 덧씌우는 빛깔(곱하기)과 세기 */
  ambient: string
  ambientAlpha: number
  /** 창으로 들어와 바닥에 떨어지는 햇빛 세기 */
  beamAlpha: number
  stars: number
  /** 건물 창에 불이 켜진 비율 */
  litRatio: number
}

const NIGHT: Omit<SkyKeyframe, 'hour'> = {
  top: '#0b1330', horizon: '#1f2b55', cloud: '#2b3659', cloudShade: '#1f2946', mountain: '#141c36',
  far: '#1b2442', near: '#11182d', lit: '#ffd66b', unlit: '#1f2740', sun: '#fff1c2',
  ambient: '#7f8cc4', ambientAlpha: 0.28, beamAlpha: 0, stars: 1, litRatio: 0.34,
}

const KEYFRAMES: readonly SkyKeyframe[] = [
  { hour: 0, ...NIGHT },
  { hour: 4.6, ...NIGHT, top: '#121a3e', horizon: '#2c3563', stars: 0.85, litRatio: 0.18 },
  {
    hour: 5.6, top: '#3d4c88', horizon: '#eaa98b', cloud: '#caa3b6', cloudShade: '#8f7aa1', mountain: '#4b4e79',
    far: '#5c608b', near: '#3e4267', lit: '#ffd98a', unlit: '#4c5074', sun: '#ffb27a',
    ambient: '#c5b7da', ambientAlpha: 0.12, beamAlpha: 0.06, stars: 0.25, litRatio: 0.22,
  },
  {
    hour: 6.6, top: '#80b1e3', horizon: '#fcd3a5', cloud: '#fff4e8', cloudShade: '#f1cab5', mountain: '#909dc1',
    far: '#a7b3cd', near: '#7e8daf', lit: '#ffe39a', unlit: '#96a4c1', sun: '#ffd9a0',
    ambient: '#ffe3c6', ambientAlpha: 0.07, beamAlpha: 0.24, stars: 0, litRatio: 0.08,
  },
  {
    hour: 9.2, top: '#6fb9ef', horizon: '#cdeafb', cloud: '#ffffff', cloudShade: '#dbe9f5', mountain: '#a0b6cf',
    far: '#b6c8dc', near: '#8fa5bf', lit: '#dbe9f6', unlit: '#aabdd2', sun: '#fff7da',
    ambient: '#ffffff', ambientAlpha: 0, beamAlpha: 0.2, stars: 0, litRatio: 0.03,
  },
  {
    hour: 12.5, top: '#55aeee', horizon: '#bfe5fb', cloud: '#ffffff', cloudShade: '#d5e7f6', mountain: '#a3b8cf',
    far: '#b8c9dc', near: '#91a6bf', lit: '#dce9f6', unlit: '#abbed3', sun: '#fffbe8',
    ambient: '#ffffff', ambientAlpha: 0, beamAlpha: 0.14, stars: 0, litRatio: 0.03,
  },
  {
    hour: 15.4, top: '#63a8e2', horizon: '#f2e2bb', cloud: '#fffaf0', cloudShade: '#eadcc8', mountain: '#a6aec0',
    far: '#bac0cd', near: '#97a1b4', lit: '#e5e9ef', unlit: '#adb6c6', sun: '#ffeab0',
    ambient: '#fff1dd', ambientAlpha: 0.04, beamAlpha: 0.2, stars: 0, litRatio: 0.05,
  },
  {
    hour: 17.3, top: '#7a9fd3', horizon: '#f9c27a', cloud: '#ffe2bc', cloudShade: '#e8b48c', mountain: '#9a8fa6',
    far: '#b19aa0', near: '#8a7683', lit: '#ffe39a', unlit: '#9c8791', sun: '#ffc46a',
    ambient: '#ffdcb2', ambientAlpha: 0.09, beamAlpha: 0.28, stars: 0, litRatio: 0.16,
  },
  {
    hour: 18.4, top: '#5d63a8', horizon: '#f58b62', cloud: '#f7a57e', cloudShade: '#b9678a', mountain: '#5d4f78',
    far: '#6f5d82', near: '#4d3f63', lit: '#ffd98a', unlit: '#5f5073', sun: '#ff8f55',
    ambient: '#f1b99c', ambientAlpha: 0.13, beamAlpha: 0.12, stars: 0.05, litRatio: 0.34,
  },
  {
    hour: 19.3, top: '#2a3170', horizon: '#a15a86', cloud: '#6d4e7c', cloudShade: '#4a3a62', mountain: '#2b2a4f',
    far: '#34345a', near: '#232544', lit: '#ffd66b', unlit: '#2d3050', sun: '#ff8f55',
    ambient: '#a09cd4', ambientAlpha: 0.22, beamAlpha: 0, stars: 0.55, litRatio: 0.62,
  },
  { hour: 20.6, ...NIGHT, top: '#111a3c', horizon: '#27315f', stars: 1, litRatio: 0.58 },
  { hour: 24, ...NIGHT },
]

const SUNRISE = 6
const SUNSET = 18.5
const MOONRISE = 19
const MOONSET = 5.5

export type SkyState = {
  hour: number
  period: SkyPeriod
  top: Rgb
  horizon: Rgb
  cloud: Rgb
  cloudShade: Rgb
  mountain: Rgb
  far: Rgb
  near: Rgb
  lit: Rgb
  unlit: Rgb
  sunColor: Rgb
  ambient: Rgb
  ambientAlpha: number
  beamAlpha: number
  stars: number
  litRatio: number
  /** 창 너비·높이에 대한 비율(0~1). 떠 있지 않으면 null */
  sun: { x: number; altitude: number } | null
  moon: { x: number; altitude: number } | null
}

function hexRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

export function rgbText(color: Rgb, alpha = 1) {
  const [r, g, b] = color.map((channel) => Math.round(Math.max(0, Math.min(255, channel))))
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** 사람이 부르는 때: 새벽(4:30~6), 아침(~9), 낮(~14), 오후(~17:20), 저녁(~19:30), 밤 */
export function skyPeriodForHour(hour: number): SkyPeriod {
  const h = ((hour % 24) + 24) % 24
  if (h >= 4.5 && h < 6) return '새벽'
  if (h >= 6 && h < 9) return '아침'
  if (h >= 9 && h < 14) return '낮'
  if (h >= 14 && h < 17.33) return '오후'
  if (h >= 17.33 && h < 19.5) return '저녁'
  return '밤'
}

function arc(hour: number, rise: number, set: number) {
  const length = (set - rise + 24) % 24
  const since = (hour - rise + 24) % 24
  if (since > length) return null
  const t = since / length
  return { x: 0.08 + t * 0.84, altitude: Math.sin(Math.PI * t) }
}

/** 시각(0~24, 소수 포함)의 하늘. 기준 시각 사이 색은 고르게 섞는다. */
export function skyStateAt(hour: number): SkyState {
  const h = ((hour % 24) + 24) % 24
  let index = 0
  while (index < KEYFRAMES.length - 2 && KEYFRAMES[index + 1].hour <= h) index += 1
  const from = KEYFRAMES[index]
  const to = KEYFRAMES[index + 1]
  const t = to.hour === from.hour ? 0 : (h - from.hour) / (to.hour - from.hour)
  const color = (key: 'top' | 'horizon' | 'cloud' | 'cloudShade' | 'mountain' | 'far' | 'near' | 'lit' | 'unlit' | 'sun' | 'ambient') =>
    mixRgb(hexRgb(from[key]), hexRgb(to[key]), t)
  const number = (key: 'ambientAlpha' | 'beamAlpha' | 'stars' | 'litRatio') => from[key] + (to[key] - from[key]) * t
  return {
    hour: h,
    period: skyPeriodForHour(h),
    top: color('top'),
    horizon: color('horizon'),
    cloud: color('cloud'),
    cloudShade: color('cloudShade'),
    mountain: color('mountain'),
    far: color('far'),
    near: color('near'),
    lit: color('lit'),
    unlit: color('unlit'),
    sunColor: color('sun'),
    ambient: color('ambient'),
    ambientAlpha: number('ambientAlpha'),
    beamAlpha: number('beamAlpha'),
    stars: number('stars'),
    litRatio: number('litRatio'),
    sun: arc(h, SUNRISE, SUNSET),
    moon: arc(h, MOONRISE, MOONSET),
  }
}

// ── 그리기 ────────────────────────────────────────────────

export type SkyRect = { x: number; y: number; w: number; h: number }

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

/** 자리마다 늘 같은 값(0~1)을 내는 작은 해시 */
function hash(x: number, y: number) {
  let value = Math.imul(x * 73856093 ^ y * 19349663, 0x5bd1e995)
  value ^= value >>> 13
  value = Math.imul(value, 0x5bd1e995)
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296
}

function disc(ctx: Ctx, cx: number, cy: number, radius: number, color: string) {
  for (let dy = -radius; dy <= radius; dy += 1) {
    const half = Math.round(Math.sqrt(radius * radius - dy * dy + radius * 0.6))
    rect(ctx, cx - half, cy + dy, half * 2 + 1, 1, color)
  }
}

/** 하늘 띠 사이를 체크무늬로 섞어 도트 느낌의 그러데이션을 만든다. */
function drawGradient(ctx: Ctx, area: SkyRect, state: SkyState) {
  const band = 3
  const bands = Math.ceil(area.h / band)
  const colors: string[] = []
  for (let index = 0; index < bands; index += 1) {
    const t = bands === 1 ? 0 : index / (bands - 1)
    colors.push(rgbText(mixRgb(state.top, state.horizon, Math.pow(t, 1.35))))
  }
  for (let index = 0; index < bands; index += 1) {
    const y = area.y + index * band
    rect(ctx, area.x, y, area.w, Math.min(band, area.y + area.h - y), colors[index])
    if (index === 0) continue
    ctx.fillStyle = colors[index - 1]
    for (let x = area.x + (index % 2); x < area.x + area.w; x += 2) ctx.fillRect(x, y, 1, 1)
  }
}

function drawSun(ctx: Ctx, area: SkyRect, state: SkyState, horizonY: number) {
  if (!state.sun) return
  const cx = Math.round(area.x + state.sun.x * area.w)
  const cy = Math.round(horizonY - state.sun.altitude * (horizonY - area.y - 7))
  disc(ctx, cx, cy, 7, rgbText(state.sunColor, 0.22))
  disc(ctx, cx, cy, 5, rgbText(state.sunColor))
  disc(ctx, cx - 1, cy - 1, 2, rgbText(mixRgb(state.sunColor, [255, 255, 255], 0.6)))
}

function drawMoon(ctx: Ctx, area: SkyRect, state: SkyState, horizonY: number) {
  if (!state.moon) return
  const cx = Math.round(area.x + state.moon.x * area.w)
  const cy = Math.round(horizonY - state.moon.altitude * (horizonY - area.y - 7))
  disc(ctx, cx, cy, 6, 'rgba(244, 241, 208, 0.12)')
  disc(ctx, cx, cy, 4, '#f4f1d0')
  // 초승달: 하늘색 원으로 한쪽을 가린다.
  const t = Math.min(1, Math.max(0, (cy - area.y) / area.h))
  disc(ctx, cx + 2, cy - 1, 3, rgbText(mixRgb(state.top, state.horizon, Math.pow(t, 1.35))))
}

/** 먼 산, 먼 빌딩과 남산타워, 가까운 빌딩(창 불빛). 투명한 층에 그려 구름 앞에 얹는다. */
function drawSkyline(ctx: Ctx, area: SkyRect, state: SkyState) {
  const base = area.y + area.h
  // 먼 산 능선
  const mountain = rgbText(state.mountain)
  for (let x = area.x; x < area.x + area.w; x += 1) {
    const u = (x - area.x) / area.w
    const ridge = 9 + Math.round(Math.sin(u * 5.2 + 0.6) * 3 + Math.sin(u * 13.7) * 1.4)
    rect(ctx, x, base - ridge - 8, 1, ridge + 8, mountain)
  }
  // 남산타워(언덕 위)
  const towerX = area.x + Math.round(area.w * 0.64)
  const near = rgbText(state.near)
  const far = rgbText(state.far)
  rect(ctx, towerX - 6, base - 20, 13, 4, far)
  rect(ctx, towerX - 4, base - 22, 9, 2, far)
  rect(ctx, towerX, base - 36, 1, 14, far)
  rect(ctx, towerX - 1, base - 30, 3, 3, far)
  rect(ctx, towerX - 2, base - 29, 5, 1, far)
  // 먼 빌딩
  const farHeights = [9, 13, 10, 16, 11, 14, 8, 12, 15, 10]
  for (let x = area.x, index = 0; x < area.x + area.w; x += 7, index += 1) {
    if (Math.abs(x + 3 - towerX) < 8) continue
    const height = farHeights[index % farHeights.length]
    rect(ctx, x, base - height, Math.min(6, area.x + area.w - x), height, far)
  }
  // 가까운 빌딩과 창 불빛
  const nearHeights = [12, 18, 14, 22, 11, 16, 20, 13, 17]
  const widths = [10, 8, 12, 9, 11, 8, 10, 12, 9]
  const lit = rgbText(state.lit)
  const unlit = rgbText(state.unlit)
  for (let x = area.x + 1, index = 0; x < area.x + area.w - 2; index += 1) {
    const width = Math.min(widths[index % widths.length], area.x + area.w - x)
    const height = nearHeights[index % nearHeights.length]
    rect(ctx, x, base - height, width, height, near)
    // 옥상 난간
    rect(ctx, x + 1, base - height - 1, Math.max(1, width - 2), 1, near)
    for (let wy = base - height + 2; wy < base - 1; wy += 3) {
      for (let wx = x + 1; wx < x + width - 1; wx += 2) {
        rect(ctx, wx, wy, 1, 1, hash(wx, wy) < state.litRatio ? lit : unlit)
      }
    }
    x += width + 2
  }
}

type Cloud = { x: number; y: number; w: number; speed: number }

const CLOUDS: readonly Cloud[] = [
  { x: 0.08, y: 0.18, w: 16, speed: 0.0009 },
  { x: 0.46, y: 0.08, w: 11, speed: 0.0013 },
  { x: 0.7, y: 0.3, w: 19, speed: 0.0007 },
  { x: 0.28, y: 0.4, w: 9, speed: 0.0011 },
]

function drawCloud(ctx: Ctx, x: number, y: number, w: number, light: string, shade: string) {
  const h = Math.max(3, Math.round(w / 4))
  rect(ctx, x + 2, y + 1, w - 4, h, light)
  rect(ctx, x, y + 2, w, h - 1, light)
  rect(ctx, x + Math.round(w * 0.25), y - 1, Math.round(w * 0.35), 2, light)
  rect(ctx, x + Math.round(w * 0.55), y, Math.round(w * 0.25), 1, light)
  rect(ctx, x + 1, y + h, w - 2, 1, shade)
}

/** 구름(천천히 흐른다), 별 반짝임, 남산타워 경고등. now는 밀리초. */
function drawSkyMotion(ctx: Ctx, area: SkyRect, state: SkyState, now: number, animate: boolean) {
  if (state.stars > 0.02) {
    for (let index = 0; index < 22; index += 1) {
      const sx = area.x + Math.floor(hash(index, 7) * area.w)
      const sy = area.y + Math.floor(hash(index, 13) * area.h * 0.62)
      const twinkle = animate && hash(index, Math.floor(now / 900)) < 0.12
      const alpha = state.stars * (twinkle ? 0.35 : 0.55 + hash(index, 3) * 0.45)
      rect(ctx, sx, sy, 1, 1, `rgba(244, 241, 208, ${alpha.toFixed(3)})`)
    }
  }
  const light = rgbText(state.cloud, state.stars > 0.6 ? 0.55 : 0.95)
  const shade = rgbText(state.cloudShade, state.stars > 0.6 ? 0.5 : 0.9)
  for (const cloud of CLOUDS) {
    const drift = animate ? now * cloud.speed * 0.001 : 0
    const span = area.w + cloud.w * 2
    const x = area.x - cloud.w + (((cloud.x * area.w + drift * area.w) % span) + span) % span
    drawCloud(ctx, Math.round(x), Math.round(area.y + cloud.y * area.h), cloud.w, light, shade)
  }
}

function drawTowerLight(ctx: Ctx, area: SkyRect, state: SkyState, now: number, animate: boolean) {
  if (state.litRatio < 0.2) return
  if (animate && Math.floor(now / 700) % 2 === 1) return
  const towerX = area.x + Math.round(area.w * 0.64)
  rect(ctx, towerX, area.y + area.h - 37, 1, 1, '#ff5b4f')
}

export type SkyPainter = {
  /** 창 안쪽(월드 좌표)에 하늘을 그린다. 분이 바뀔 때만 하늘·건물을 새로 만든다. */
  paint(ctx: Ctx, hour: number, now: number, animate: boolean): SkyState
}

function layer(width: number, height: number) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  return ctx ? { canvas, ctx } : null
}

export function createSkyPainter(area: SkyRect): SkyPainter | null {
  const back = layer(area.w, area.h)
  const front = layer(area.w, area.h)
  if (!back || !front) return null
  const local: SkyRect = { x: 0, y: 0, w: area.w, h: area.h }
  let cachedMinute = -1
  let state = skyStateAt(12)

  return {
    paint(ctx, hour, now, animate) {
      const minute = Math.floor(hour * 60)
      if (minute !== cachedMinute) {
        cachedMinute = minute
        state = skyStateAt(hour)
        back.ctx.clearRect(0, 0, area.w, area.h)
        drawGradient(back.ctx, local, state)
        const horizonY = local.y + local.h - 12
        drawSun(back.ctx, local, state, horizonY)
        drawMoon(back.ctx, local, state, horizonY)
        front.ctx.clearRect(0, 0, area.w, area.h)
        drawSkyline(front.ctx, local, state)
      }
      ctx.drawImage(back.canvas, area.x, area.y)
      ctx.save()
      ctx.beginPath()
      ctx.rect(area.x, area.y, area.w, area.h)
      ctx.clip()
      drawSkyMotion(ctx, area, state, now, animate)
      ctx.restore()
      ctx.drawImage(front.canvas, area.x, area.y)
      drawTowerLight(ctx, area, state, now, animate)
      return state
    },
  }
}
