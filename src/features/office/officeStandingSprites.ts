import type { HairStyle, OfficeLook } from './officeCharacter'
import {
  accentShade,
  createGrid,
  EYES,
  FACE_FRONT,
  GLASSES_FRONT,
  HAIR,
  HAIR_ACCESSORY_FRONT,
  HEAD_BACK,
  HEAD_Y,
  HEADPHONES_BACK,
  HEADPHONES_FRONT,
  LANYARD_FRONT,
  MAP_X,
  outlineGrid,
  paletteFor,
  RAISED_FRONT,
  SPRITE_WIDTH,
  stamp,
  TOP_BACK,
  TOP_FRONT,
  TORSO_Y,
  type PixelGrid,
  type PixelMap,
  type SpriteExpression,
} from './officeSprites'

/**
 * 서 있는 캐릭터(걷기·자리 밖 활동). 앉은 캐릭터와 같은 머리 픽셀맵을 쓰고,
 * 옆모습(왼쪽을 보는 모습)은 따로 그린다. 오른쪽은 왼쪽을 좌우로 뒤집는다.
 */

export type Facing = 'down' | 'up' | 'left' | 'right'
/** 손에 든 물건. 자리로 돌아올 때 출력물·바인더·컵을 들고 온다. */
export type HeldItem = 'none' | 'paper' | 'binder' | 'cup'
export type StandingPose = 'walk' | 'stand' | 'reach' | 'sip' | 'talk'

export type StandingFrame = {
  facing: Facing
  pose: StandingPose
  /** 걷기 0~3(선 자세·왼발·선 자세·오른발), 그 밖의 자세는 0 또는 1 */
  frame: number
  held: HeldItem
  expression: SpriteExpression
}

export const STAND_HEIGHT = 32
/** 신발 바닥 행. 발 위치(y)에 이 행을 맞춘다. */
export const STAND_FEET_ROW = 29
const LEGS_Y = TORSO_Y + 7

// ── 옆모습 얼굴·머리 ─────────────────────────────────────────

const FACE_SIDE: PixelMap = [
  '................',
  '................',
  '................',
  '................',
  '.....sssssss....',
  '....sssssssss...',
  '...sssssssssss..',
  '...sssssssssss..',
  '..ssssssssssss..',
  '...sssssssssss..',
  '...sssssssssss..',
  '....Sssssssss...',
  '.....SSSSSSS....',
  '.........SS.....',
]

const EYES_SIDE: Record<SpriteExpression, PixelMap> = {
  normal: ['....e...........', '....e...........'],
  blink: ['................', '...ee...........'],
  happy: ['....e...........', '...e.e..........'],
  focus: ['................', '....e...........'],
  glance: ['....e...........', '....e...........'],
  surprised: ['...ee...........', '...ee...........'],
}

const GLASSES_SIDE: PixelMap = [
  '...ggg..........',
  '...g.gggg.......',
  '...g.g..........',
  '...ggg..........',
]

const HEADPHONES_SIDE: PixelMap = [
  '................',
  '........kk......',
  '.........k......',
  '.........k......',
  '.........k......',
  '.........k......',
  '.........k......',
  '........aaa.....',
  '........aaa.....',
  '........aaa.....',
]

const HAIR_ACCESSORY_SIDE: Record<'pin' | 'ribbon', PixelMap> = {
  pin: ['................', '................', '................', '.....aa.........'],
  ribbon: ['................', '...........a.a..', '...........aaa..', '...........a.a..'],
}

const HAIR_SIDE: Record<HairStyle, PixelMap> = {
  neat: [
    '................',
    '......hhhhh.....',
    '....hhhLLhhhh...',
    '...hhhhhhhhhhhh.',
    '..hhhhhhhhhhhhh.',
    '..hhhhhhhhhhhhh.',
    '..hHhhh.hhhhhhh.',
    '...H.....hhhhhh.',
    '.........hhhhhh.',
    '.........hhhhhh.',
    '..........hhhhh.',
    '..........HhhH..',
    '...........HH...',
  ],
  dandy: [
    '................',
    '......hhhhh.....',
    '....hhhhhhhhh...',
    '...hhhLLhhhhhhh.',
    '..hhhhhhhhhhhhh.',
    '..hhhhhhhhhhhhh.',
    '..hhhhhhhhhhhhh.',
    '..hHhHh..hhhhhh.',
    '.........hhhhhh.',
    '.........hhhhhh.',
    '.........hhhhhh.',
    '.........HhhhH..',
    '..........HHH...',
  ],
  twoBlock: [
    '.....hhhhhh.....',
    '...hhhhLLhhhh...',
    '..hhhhhhhhhhhhh.',
    '..hhhhhhhhhhhhh.',
    '..hhhhhhhhhhhhh.',
    '..hHhhhhhhhhhhH.',
    '...H.hH..HHHHHH.',
    '.........HHHHH..',
    '.........HHHHH..',
    '.........HHHH...',
    '..........HHH...',
  ],
  perm: [
    '.....h.hhh.h....',
    '...hhhhhhhhhhh..',
    '..hhhLhhhhhLhhh.',
    '.hhhhhhhhhhhhhhh',
    '..hhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhhh',
    '..hHhhH..hhhhhh.',
    '..h..H...hhhhhhh',
    '.........hhhhhh.',
    '........hhhhhhhh',
    '.........hhhhhh.',
    '..........hHhH..',
  ],
  spiky: [
    '....h...h..h....',
    '...hh.hhh.hhh...',
    '..hhhhhhhhhhhhh.',
    '..hhhhLLhhhhhhhh',
    '..hhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhhh',
    '..hHhH..hhhhhhh.',
    '..h......hhhhhh.',
    '.........hhhhhh.',
    '.........hhhhhh.',
    '..........hhhhh.',
    '..........HhH...',
  ],
  buzz: [
    '................',
    '................',
    '.....hhhhhhh....',
    '....hhhLLhhhh...',
    '...hhhhhhhhhhh..',
    '...hHhhhhhhhhh..',
    '...H.....hhhhh..',
    '..........hhhh..',
    '..........hhhh..',
    '..........HHH...',
  ],
  long: [
    '................',
    '......hhhhh.....',
    '....hhhhhhhhh...',
    '...hhhLLhhhhhhh.',
    '..hhhhhhhhhhhhh.',
    '..hhhhhhhhhhhhh.',
    '..hhhhhhhhhhhhhh',
    '..hHhHh..hhhhhhh',
    '.........hhhhhhh',
    '.........hhhhhhh',
    '.........hhhhhhh',
    '.........hhhhhhh',
    '.........hhhhhhh',
    '..........hhhhhh',
    '..........hhhhh.',
    '..........hhhhh.',
    '..........HhhHh.',
    '...........HHH..',
  ],
  bob: [
    '................',
    '......hhhhh.....',
    '....hhhhhhhhh...',
    '...hhhLLhhhhhhh.',
    '..hhhhhhhhhhhhh.',
    '..hhhhhhhhhhhhh.',
    '..hhhhhhhhhhhhhh',
    '..hHhHh..hhhhhhh',
    '.........hhhhhhh',
    '.........hhhhhhh',
    '.........hhhhhhh',
    '........hhhhhhhh',
    '........HHhhhhHH',
  ],
  ponytail: [
    '................',
    '......hhhhh.....',
    '....hhhhhhhhh...',
    '...hhhLLhhhhhh..',
    '..hhhhhhhhhhhhh.',
    '..hhhhhhhhhhhhaa',
    '..hHhhh..hhhhhhh',
    '..h......hhhhhhh',
    '.........hhhh.hh',
    '.........hhhh.hh',
    '..........hhh.hh',
    '..............hH',
    '..............H.',
  ],
  bun: [
    '.........hhh....',
    '........hhLhh...',
    '....hhhhhhhhhh..',
    '...hhhLLhhhhhhh.',
    '..hhhhhhhhhhhhh.',
    '..hhhhhhhhhhhhh.',
    '..hHhhh..hhhhhh.',
    '..h......hhhhhh.',
    '.........hhhhh..',
    '.........HhhhH..',
    '..........HHH...',
  ],
  wavy: [
    '................',
    '......hhhhh.....',
    '....hhhhhhhhh...',
    '...hhhLLhhhhhhh.',
    '..hhhhhhhhhhhhh.',
    '..hhhhhhhhhhhhhh',
    '..hhhhhhhhhhhhh.',
    '..hHhHh..hhhhhhh',
    '.........hhhhhh.',
    '.........hhhhhhh',
    '.........hhhhhh.',
    '.........hhhhhhh',
    '..........hhhhh.',
    '..........hhhhhh',
    '..........hhhLh.',
    '...........hhhhh',
    '...........HhhH.',
    '............HH..',
  ],
  pigtails: [
    '................',
    '......hhhhh.....',
    '....hhhhhhhhh...',
    '...hhhLLhhhhhhh.',
    '..hhhhhhhhhhhhh.',
    '..hhhhhhhhhhhhh.',
    '..hHhHh..hhhhhh.',
    '.........hhhhhh.',
    '.........hhhhha.',
    '..........hhhhhh',
    '..........hhhhhh',
    '...........hhhhh',
    '...........hhhhh',
    '............hHh.',
  ],
}

// ── 몸통·다리 ──────────────────────────────────────────────

const TORSO_UPRIGHT: Record<'idle' | 'stepA' | 'stepB' | 'hold' | 'oneArm', PixelMap> = {
  idle: [
    '.....tttttt.....',
    '...tttttttttt...',
    '..TttttttttttT..',
    '..TttttttttttT..',
    '..TttttttttttT..',
    '..sTttttttttTs..',
    '...PPPPPPPPPP...',
  ],
  stepA: [
    '.....tttttt.....',
    '...tttttttttt...',
    '..TttttttttttT..',
    '..TttttttttttT..',
    '..TttttttttttTs.',
    '..TTttttttttTT..',
    '..sPPPPPPPPPP...',
  ],
  stepB: [
    '.....tttttt.....',
    '...tttttttttt...',
    '..TttttttttttT..',
    '..TttttttttttT..',
    '.sTttttttttttT..',
    '..TTttttttttTT..',
    '...PPPPPPPPPPs..',
  ],
  hold: [
    '.....tttttt.....',
    '...tttttttttt...',
    '..TttttttttttT..',
    '..TTttttttttTT..',
    '...TTttttttTT...',
    '...tttttttttt...',
    '...PPPPPPPPPP...',
  ],
  oneArm: [
    '.....tttttt.....',
    '...tttttttttt...',
    '..TttttttttttT..',
    '..Ttttttttttt...',
    '..Ttttttttttt...',
    '..sTtttttttt....',
    '...PPPPPPPPPP...',
  ],
}

const TORSO_SIDE: Record<'idle' | 'swingF' | 'swingB' | 'hold' | 'reach', PixelMap> = {
  idle: [
    '......tttt......',
    '.....tttttt.....',
    '.....ttTttt.....',
    '.....ttTttt.....',
    '.....ttTttt.....',
    '.....ttsttt.....',
    '.....PPPPPP.....',
  ],
  swingF: [
    '......tttt......',
    '.....tttttt.....',
    '.....tTtttt.....',
    '....tTttttt.....',
    '...sTtttttt.....',
    '.....tttttt.....',
    '.....PPPPPP.....',
  ],
  swingB: [
    '......tttt......',
    '.....tttttt.....',
    '.....tttTtt.....',
    '.....ttttTt.....',
    '.....tttttTs....',
    '.....tttttt.....',
    '.....PPPPPP.....',
  ],
  hold: [
    '......tttt......',
    '.....tttttt.....',
    '....tTTtttt.....',
    '...sTttttt......',
    '.....tttttt.....',
    '.....tttttt.....',
    '.....PPPPPP.....',
  ],
  reach: [
    '......tttt......',
    '.....tttttt.....',
    '.sTTTTtttttt....',
    '.....tttttt.....',
    '.....tttttt.....',
    '.....tttttt.....',
    '.....PPPPPP.....',
  ],
}

const LEGS_UPRIGHT: Record<'stand' | 'stepA' | 'stepB', PixelMap> = {
  stand: [
    '....pppppppp....',
    '....ppp..ppp....',
    '....ppp..ppp....',
    '....PPP..PPP....',
    '....fff..fff....',
  ],
  stepA: [
    '....pppppppp....',
    '....ppp..ppp....',
    '....ppp..PPP....',
    '....PPP..fff....',
    '....fff.........',
  ],
  stepB: [
    '....pppppppp....',
    '....ppp..ppp....',
    '....PPP..ppp....',
    '....fff..PPP....',
    '.........fff....',
  ],
}

const LEGS_SIDE: Record<'stand' | 'step', PixelMap> = {
  stand: [
    '.....pppppp.....',
    '......pppp......',
    '......pppp......',
    '......PPPP......',
    '.....fffff......',
  ],
  step: [
    '.....pppppp.....',
    '.....pp..pp.....',
    '....pp....pp....',
    '....PP....PP....',
    '...fff....fff...',
  ],
}

const TOP_SIDE: Partial<Record<OfficeLook['top'], PixelMap>> = {
  tee: ['......sT........'],
  shirt: ['......is........', '......i.........'],
  hoodie: ['.........TTT....', '..........T.....'],
  cardigan: ['......i.........', '......i.........'],
  blazer: ['......ii........', '......i.........'],
  knit: ['......T.........', '................', '................', '.....TtTtTt.....'],
}

const LANYARD_SIDE: PixelMap = ['......a.........', '......a.........', '.....ww.........', '.....ww.........']

// 손에 든 물건(몸통 0행 기준)
const HELD_UPRIGHT: Record<Exclude<HeldItem, 'none'>, PixelMap> = {
  paper: [
    '................',
    '................',
    '.....wwwwww.....',
    '.....wkkkkw.....',
    '....swwwwwws....',
    '.....wwwwww.....',
  ],
  binder: [
    '................',
    '................',
    '.....aaaaaa.....',
    '.....aawwaa.....',
    '....saaaaaas....',
    '.....AAAAAA.....',
  ],
  cup: [
    '................',
    '................',
    '..........yyy...',
    '..........yyyY..',
    '..........syy...',
  ],
}

const HELD_SIDE: Record<Exclude<HeldItem, 'none'>, PixelMap> = {
  paper: [
    '................',
    '..ww............',
    '..ww............',
    '..wws...........',
    '..ww............',
  ],
  binder: [
    '................',
    '..aa............',
    '..aw............',
    '..aas...........',
    '..AA............',
  ],
  cup: [
    '................',
    '................',
    '..yyy...........',
    '..yyyY..........',
    '...ys...........',
  ],
}

// 뒷모습에서 한 팔을 들어 게시판을 가리키는 자세(20칸, 머리 픽셀맵 0행 기준)
const POINT_BACK: { map: PixelMap; y: number } = {
  // 2.5등신이라 팔이 짧다: 손은 귀 옆 높이까지만 올라간다.
  y: 8,
  map: [
    '.................ss.',
    '.................ss.',
    '................tT..',
    '................tT..',
    '...............tT...',
    '...............tT...',
  ],
}

function mirror(grid: PixelGrid): PixelGrid {
  const pixels = new Array<string | null>(grid.pixels.length)
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      pixels[y * grid.width + x] = grid.pixels[y * grid.width + (grid.width - 1 - x)]
    }
  }
  return { ...grid, pixels }
}

function uprightTorso(pose: StandingPose, frame: number, held: HeldItem): PixelMap {
  if (pose === 'sip') return TORSO_UPRIGHT.oneArm
  if (held !== 'none') return TORSO_UPRIGHT.hold
  if (pose === 'walk') return frame === 1 ? TORSO_UPRIGHT.stepA : frame === 3 ? TORSO_UPRIGHT.stepB : TORSO_UPRIGHT.idle
  return TORSO_UPRIGHT.idle
}

function uprightLegs(pose: StandingPose, frame: number): PixelMap {
  if (pose !== 'walk') return LEGS_UPRIGHT.stand
  return frame === 1 ? LEGS_UPRIGHT.stepA : frame === 3 ? LEGS_UPRIGHT.stepB : LEGS_UPRIGHT.stand
}

function sideTorso(pose: StandingPose, frame: number, held: HeldItem): PixelMap {
  if (pose === 'reach') return TORSO_SIDE.reach
  if (held !== 'none') return TORSO_SIDE.hold
  if (pose === 'walk') return frame === 1 ? TORSO_SIDE.swingF : frame === 3 ? TORSO_SIDE.swingB : TORSO_SIDE.idle
  return TORSO_SIDE.idle
}

/**
 * 서 있는 캐릭터 한 장(20×32, 외곽선 포함). 발은 STAND_FEET_ROW에 놓인다.
 * 걷는 장은 몸이 한 칸 내려앉아 발걸음이 느껴지게 한다.
 */
export function composeStandingSprite(look: OfficeLook, sprite: StandingFrame): PixelGrid {
  const grid = createGrid(SPRITE_WIDTH, STAND_HEIGHT)
  const palette = { ...paletteFor(look), A: accentShade(look.accent) }
  const hair = HAIR[look.hairStyle]
  const bob = sprite.pose === 'walk' && (sprite.frame === 1 || sprite.frame === 3) ? 1 : 0
  const headY = HEAD_Y + bob
  const torsoY = TORSO_Y + bob
  const facing = sprite.facing === 'right' ? 'left' : sprite.facing

  if (facing === 'down') {
    if (hair.behind) stamp(grid, hair.behind, MAP_X, headY, palette)
    stamp(grid, uprightLegs(sprite.pose, sprite.frame), MAP_X, LEGS_Y, palette)
    stamp(grid, uprightTorso(sprite.pose, sprite.frame, sprite.held), MAP_X, torsoY, palette)
    stamp(grid, TOP_FRONT[look.top], MAP_X, torsoY, palette)
    if (look.lanyard && look.top !== 'hoodie' && sprite.held === 'none') stamp(grid, LANYARD_FRONT, MAP_X, torsoY, palette)
    stamp(grid, FACE_FRONT, MAP_X, headY, palette)
    stamp(grid, EYES[sprite.expression], MAP_X, headY + 8, palette)
    if (look.blush) stamp(grid, ['....b......b....'], MAP_X, headY + 10, palette)
    if (sprite.pose === 'talk' && sprite.frame % 2 === 1) stamp(grid, ['.......mm.......'], MAP_X, headY + 11, palette)
    if (look.glasses !== 'none') stamp(grid, GLASSES_FRONT[look.glasses], MAP_X, headY + 7, palette)
    stamp(grid, hair.front, MAP_X, headY, palette)
    if (look.hairAccessory !== 'none') stamp(grid, HAIR_ACCESSORY_FRONT[look.hairAccessory], MAP_X, headY, palette)
    if (look.headphones) stamp(grid, HEADPHONES_FRONT, MAP_X, headY, palette)
    if (sprite.held !== 'none' && sprite.pose !== 'sip') stamp(grid, HELD_UPRIGHT[sprite.held], MAP_X, torsoY, palette)
    if (sprite.pose === 'sip') stamp(grid, RAISED_FRONT.sip.map, 0, HEAD_Y + RAISED_FRONT.sip.y, palette)
  } else if (facing === 'up') {
    stamp(grid, uprightLegs(sprite.pose, sprite.frame), MAP_X, LEGS_Y, palette)
    // 손을 든 쪽 팔은 몸통에서 빼야 팔이 셋으로 보이지 않는다.
    const backTorso = sprite.held !== 'none'
      ? TORSO_UPRIGHT.hold
      : sprite.pose === 'reach'
        ? TORSO_UPRIGHT.oneArm
        : uprightTorso(sprite.pose, sprite.frame, 'none')
    stamp(grid, backTorso, MAP_X, torsoY, palette)
    const topBack = TOP_BACK[look.top]
    if (topBack) stamp(grid, topBack, MAP_X, torsoY, palette)
    stamp(grid, HEAD_BACK, MAP_X, headY, palette)
    stamp(grid, hair.back, MAP_X, headY, palette)
    if (look.hairAccessory === 'ribbon') stamp(grid, ['......a.a.......', '......aaa.......'], MAP_X, headY + 1, palette)
    if (look.headphones) stamp(grid, HEADPHONES_BACK, MAP_X, headY, palette)
    if (sprite.pose === 'reach') stamp(grid, POINT_BACK.map, 0, HEAD_Y + POINT_BACK.y, palette)
  } else {
    stamp(grid, sprite.pose === 'walk' && (sprite.frame === 1 || sprite.frame === 3) ? LEGS_SIDE.step : LEGS_SIDE.stand, MAP_X, LEGS_Y, palette)
    stamp(grid, sideTorso(sprite.pose, sprite.frame, sprite.held), MAP_X, torsoY, palette)
    const topSide = TOP_SIDE[look.top]
    if (topSide) stamp(grid, topSide, MAP_X, torsoY, palette)
    if (look.lanyard && look.top !== 'hoodie' && sprite.held === 'none' && sprite.pose !== 'reach') {
      stamp(grid, LANYARD_SIDE, MAP_X, torsoY, palette)
    }
    stamp(grid, FACE_SIDE, MAP_X, headY, palette)
    stamp(grid, EYES_SIDE[sprite.expression], MAP_X, headY + 8, palette)
    if (look.blush) stamp(grid, ['.....b..........'], MAP_X, headY + 10, palette)
    if (sprite.pose === 'talk' && sprite.frame % 2 === 1) stamp(grid, ['...m............'], MAP_X, headY + 11, palette)
    if (look.glasses !== 'none') stamp(grid, GLASSES_SIDE, MAP_X, headY + 7, palette)
    stamp(grid, HAIR_SIDE[look.hairStyle], MAP_X, headY, palette)
    if (look.hairAccessory !== 'none') stamp(grid, HAIR_ACCESSORY_SIDE[look.hairAccessory], MAP_X, headY, palette)
    if (look.headphones) stamp(grid, HEADPHONES_SIDE, MAP_X, headY, palette)
    if (sprite.held !== 'none') stamp(grid, HELD_SIDE[sprite.held], MAP_X, torsoY, palette)
  }

  const outlined = outlineGrid(grid)
  return sprite.facing === 'right' ? mirror(outlined) : outlined
}

/** 테스트용: 서 있는 모습 픽셀맵 목록 */
export function standingPixelMapsForTest(): Array<[string, PixelMap]> {
  const entries: Array<[string, PixelMap]> = [
    ['FACE_SIDE', FACE_SIDE],
    ['GLASSES_SIDE', GLASSES_SIDE],
    ['HEADPHONES_SIDE', HEADPHONES_SIDE],
    ['LANYARD_SIDE', LANYARD_SIDE],
    ['POINT_BACK', POINT_BACK.map],
  ]
  for (const [name, map] of Object.entries(HAIR_SIDE)) entries.push([`HAIR_SIDE.${name}`, map])
  for (const [name, map] of Object.entries(EYES_SIDE)) entries.push([`EYES_SIDE.${name}`, map])
  for (const [name, map] of Object.entries(HAIR_ACCESSORY_SIDE)) entries.push([`HAIR_ACCESSORY_SIDE.${name}`, map])
  for (const [name, map] of Object.entries(TORSO_UPRIGHT)) entries.push([`TORSO_UPRIGHT.${name}`, map])
  for (const [name, map] of Object.entries(TORSO_SIDE)) entries.push([`TORSO_SIDE.${name}`, map])
  for (const [name, map] of Object.entries(LEGS_UPRIGHT)) entries.push([`LEGS_UPRIGHT.${name}`, map])
  for (const [name, map] of Object.entries(LEGS_SIDE)) entries.push([`LEGS_SIDE.${name}`, map])
  for (const [name, map] of Object.entries(TOP_SIDE)) if (map) entries.push([`TOP_SIDE.${name}`, map])
  for (const [name, map] of Object.entries(HELD_UPRIGHT)) entries.push([`HELD_UPRIGHT.${name}`, map])
  for (const [name, map] of Object.entries(HELD_SIDE)) entries.push([`HELD_SIDE.${name}`, map])
  return entries
}
