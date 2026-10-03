import type { HairStyle, OfficeLook, TopStyle } from './officeCharacter'

/**
 * 바람의나라풍 2.5등신 캐릭터 도트.
 * 픽셀맵은 16칸 너비 문자열이고, 글자 하나가 색 역할 하나다(`.`은 투명).
 * 여러 층을 합친 뒤 실루엣 둘레에 어두운 외곽선을 자동으로 두른다.
 *
 * 색 역할: s/S 피부·그늘, h/H/L 머리·그늘·하이라이트, t/T 상의·그늘, i/I 안에 입은 옷,
 * e 눈, b 볼터치, m 입, g 안경테, a 포인트 색, k 짙은 소품, w 흰색, y 머그컵, c 의자.
 */

export type SpriteView = 'front' | 'back'
export type SpritePose =
  | 'type'
  | 'mouse'
  | 'sip'
  | 'think'
  | 'stretch'
  | 'nod'
  | 'write'
  | 'phone'
  | 'peer'
  | 'idle'
export type SpriteExpression = 'normal' | 'blink' | 'happy' | 'focus' | 'glance' | 'surprised'

export type SpriteFrame = {
  view: SpriteView
  pose: SpritePose
  /** 0 또는 1. 타자·끄덕임처럼 두 장이 번갈아 나오는 동작의 몇 번째 장인지 */
  frame: number
  expression: SpriteExpression
  /** 머리만 아래로 내리는 픽셀 수(끄덕임·몸 숙이기) */
  headDrop?: number
}

export type PixelGrid = {
  width: number
  height: number
  /** 행 우선 색 배열. null은 투명 */
  pixels: Array<string | null>
}

export type PixelMap = readonly string[]
export type Palette = Readonly<Record<string, string | undefined>>

export const SPRITE_WIDTH = 20
export const SPRITE_HEIGHT = 28
/** 16칸 픽셀맵을 놓는 가로 위치. 양옆 두 칸은 외곽선과 튀어나온 머리카락 몫이다. */
export const MAP_X = 2
/** 머리 픽셀맵 0행이 놓이는 세로 위치. 위 네 칸은 기지개처럼 머리 위로 올린 팔 몫이다. */
export const HEAD_Y = 4
/** 몸통 픽셀맵 0행 위치 */
export const TORSO_Y = HEAD_Y + 14
/** 앞모습(뒷줄)에서 책상 먼 쪽 모서리에 맞추는 행. 손이 이 행부터 책상 위에 놓인다. */
export const FRONT_TABLE_ROW = TORSO_Y + 7
/** 뒷모습(앞줄)에서 의자 앉는 면에 맞추는 행 */
export const BACK_SEAT_ROW = TORSO_Y + 8

export const OUTLINE_COLOR = '#231a1f'
const EYE_COLOR = '#2a2231'
const BLUSH_COLOR = '#f39aa2'
const MOUTH_COLOR = '#b54650'
const FRAME_COLOR = '#3b3030'
const GOLD_FRAME_COLOR = '#b5803e'
const DARK_PROP_COLOR = '#2f323a'
const WHITE_COLOR = '#fbfbf7'
const CHAIR_COLOR = '#3a4250'
const CHAIR_LIGHT = '#566174'
const SHOE_COLOR = '#3a3036'

// 얼굴(앞모습). 눈·볼·입은 표정 층에서 따로 찍는다.
export const FACE_FRONT: PixelMap = [
  '................',
  '................',
  '................',
  '................',
  '....ssssssss....',
  '...ssssssssss...',
  '..ssssssssssss..',
  '..ssssssssssss..',
  '..ssssssssssss..',
  '..ssssssssssss..',
  '..ssssssssssss..',
  '...SssssssssS...',
  '....SSSSSSSS....',
  '.......SS.......',
]

// 뒤통수 밑 목덜미와 귀. 머리카락이 대부분 덮는다.
export const HEAD_BACK: PixelMap = [
  '................',
  '................',
  '................',
  '................',
  '....ssssssss....',
  '...ssssssssss...',
  '..ssssssssssss..',
  '..ssssssssssss..',
  '.ssssssssssssss.',
  '.ssssssssssssss.',
  '..ssssssssssss..',
  '...SssssssssS...',
  '....SSSSSSSS....',
  '.......SS.......',
]

type HairMaps = {
  /** 앞모습에서 얼굴 위에 덮는 층 */
  front: PixelMap
  /** 앞모습에서 몸 뒤로 넘어가는 긴 머리·묶은 머리 */
  behind?: PixelMap
  /** 뒷모습 전체(몸통 위에 덮는다) */
  back: PixelMap
}

const SHORT_BACK: PixelMap = [
  '................',
  '.....hhhhhh.....',
  '...hhhhhhhhhh...',
  '..hhhhhhhhhhhh..',
  '.hhhhhhLLhhhhhh.',
  '.hhhhhLLhhhhhhh.',
  '.hhhhhhhhhhhhhh.',
  '.hhhhhhhhhhhhhh.',
  '.hhhhhhhhhhhhhh.',
  '.HhhhhhhhhhhhhH.',
  '..HhhhhhhhhhhH..',
  '...HHhhhhhhHH...',
  '....SHHHHHHS....',
]

export const HAIR: Record<HairStyle, HairMaps> = {
  neat: {
    front: [
      '................',
      '.....hhhhhh.....',
      '...hhhhhLLhhh...',
      '..hhhhhLLhhhhh..',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhHhh.',
      '.hhHHhhhhH...Hh.',
      '.hh..........hh.',
      '.h............h.',
    ],
    back: SHORT_BACK,
  },
  dandy: {
    front: [
      '................',
      '.....hhhhhh.....',
      '...hhhLLhhhhh...',
      '..hhhLLhhhhhhh..',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhHhhHhhHhhHhh.',
      '.hh.H..H..H..hh.',
      '.h............h.',
    ],
    back: [
      '................',
      '.....hhhhhh.....',
      '...hhhhhhhhhh...',
      '..hhhhhhhhhhhh..',
      '.hhhhhhLLhhhhhh.',
      '.hhhhhLLhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.HhhhhhhhhhhhhH.',
      '..HHhhhhhhhhHH..',
      '....HHHHHHHH....',
    ],
  },
  twoBlock: {
    front: [
      '....hhhhhhh.....',
      '..hhhhhLLhhhh...',
      '.hhhhhLLhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.HHhhhhhhhhhhHH.',
      '..HhhHhhHhhHhH..',
      '..H..........H..',
    ],
    back: [
      '....hhhhhhh.....',
      '..hhhhhhhhhhh...',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhLLhhhhhh.',
      '.hhhhhLLhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.HhhhhhhhhhhhhH.',
      '..HhhhhhhhhhhH..',
      '...HHHHHHHHHH...',
      '....SSSSSSSS....',
    ],
  },
  perm: {
    front: [
      '....h.hhhh.h....',
      '..hhhhhhhhhhhh..',
      '.hhhLLhhhhLhhhh.',
      'hhhLhhhhhhhhhhhh',
      '.hhhhhhhhhhhhhh.',
      'hhhhhhhhhhhhhhhh',
      '.hhhhhhhhhhhhhh.',
      '.hHhhHhhhHhhHhh.',
      '.hh.H..H...H.hh.',
      '.hh..........hh.',
      '..h..........h..',
    ],
    back: [
      '....h.hhhh.h....',
      '..hhhhhhhhhhhh..',
      '.hhhhhhhhhhhhhh.',
      'hhhhhhLLhhhhhhhh',
      '.hhhhLhhhhhLhhh.',
      'hhhhhhhhhhhhhhhh',
      '.hhhhhhhhhhhhhh.',
      'hhhhhhhhhhhhhhhh',
      '.hhhhhhhhhhhhhh.',
      '.hHhhhhhhhhhhHh.',
      '..hHhhHhhHhhHh..',
      '...HH.HHHH.HH...',
      '....S.SSSS.S....',
    ],
  },
  spiky: {
    front: [
      '...h..h..h..h...',
      '..hh.hhh.hhhhh..',
      '..hhhhhhhhhhhh..',
      '.hhhhhLLhhhhhhh.',
      '.hhhhLLhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hHhHhhHhhHhHhh.',
      '.h.H..H....H..h.',
      '.h............h.',
    ],
    back: [
      '...h..h..h..h...',
      '..hh.hhh.hhhhh..',
      '..hhhhhhhhhhhh..',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhLLhhhhhh.',
      '.hhhhhLLhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.HhhhhhhhhhhhhH.',
      '..HhhhhhhhhhhH..',
      '...HHhhhhhhHH...',
      '....SHHHHHHS....',
    ],
  },
  buzz: {
    front: [
      '................',
      '................',
      '....hhhhhhhh....',
      '...hhhhLLhhhh...',
      '..hhhhhhhhhhhh..',
      '..hHhhhhhhhhHh..',
      '..H..........H..',
    ],
    back: [
      '................',
      '................',
      '....hhhhhhhh....',
      '...hhhhhhhhhh...',
      '..hhhhhLLhhhhh..',
      '..hhhhhhhhhhhh..',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.HhhhhhhhhhhhhH.',
      '..HhhhhhhhhhhH..',
      '...HHHhhhhHHH...',
      '....SSSSSSSS....',
    ],
  },
  long: {
    front: [
      '................',
      '.....hhhhhh.....',
      '...hhhhLLhhhh...',
      '..hhhhLLhhhhhh..',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhHhHhhHhHhhh.',
      '.hh..........hh.',
      '.hh..........hh.',
      '.hh..........hh.',
      '.hh..........hh.',
      '.hH..........Hh.',
    ],
    behind: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      'hhh..........hhh',
      'hhh..........hhh',
      'hhh..........hhh',
      'hhh..........hhh',
      'hhh..........hhh',
      'hhh..........hhh',
      'hhh..........hhh',
      'hhh..........hhh',
      'hhH..........Hhh',
      'hHH..........HHh',
      '.H............H.',
    ],
    back: [
      '................',
      '.....hhhhhh.....',
      '...hhhhhhhhhh...',
      '..hhhhhhhhhhhh..',
      '.hhhhhhLLhhhhhh.',
      '.hhhhhLLhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      'hhhhhhhhhhhhhhhh',
      'hhhhhhhhhhhhhhhh',
      'hhhhhhhhhhhhhhhh',
      'hhhhhhhhhhhhhhhh',
      'hhhhhhhhhhhhhhhh',
      'hhhhhhhhhhhhhhhh',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hHhhhhhhhhhhHh.',
      '..HhHhhHhhHhHH..',
    ],
  },
  bob: {
    front: [
      '................',
      '.....hhhhhh.....',
      '...hhhhLLhhhh...',
      '..hhhhLLhhhhhh..',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhHhhHhhHhhHhh.',
      '.hh..........hh.',
      '.hh..........hh.',
      '.hh..........hh.',
      'hhh..........hhh',
      'HHh..........hHH',
    ],
    back: [
      '................',
      '.....hhhhhh.....',
      '...hhhhhhhhhh...',
      '..hhhhhhhhhhhh..',
      '.hhhhhhLLhhhhhh.',
      '.hhhhhLLhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      'hhhhhhhhhhhhhhhh',
      'HHHhhhhhhhhhhHHH',
      '..HHHHHHHHHHHH..',
    ],
  },
  ponytail: {
    front: [
      '................',
      '.....hhhhhh.....',
      '...hhhhhLLhhh...',
      '..hhhhhLLhhhhh..',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhHhh.',
      '.hhHHhhhhH...Hh.',
      '.hh..........hh.',
      '.h............h.',
    ],
    behind: [
      '................',
      '................',
      '..............hh',
      '.............hhh',
      '.............hhh',
      '..............hh',
      '..............hh',
      '..............hH',
      '..............hH',
      '.............hhH',
      '.............hH.',
      '.............H..',
    ],
    back: [
      '................',
      '.....hhhhhh.....',
      '...hhhhhhhhhh...',
      '..hhhhhhhhhhhh..',
      '.hhhhhhLLhhhhhh.',
      '.hhhhhLLhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhaahhhhhhh.',
      '.HhhhhhhhhhhhhH.',
      '..HhhhhhhhhhhH..',
      '...HHhhhhhhHH...',
      '....SShhhhSS....',
      '......hhhh......',
      '......hhhh......',
      '......hLhh......',
      '......hhhh......',
      '.......hH.......',
      '.......HH.......',
    ],
  },
  bun: {
    front: [
      '......hhhh......',
      '.....hLhhhh.....',
      '....hhhhhhhh....',
      '..hhhhhLLhhhhh..',
      '.hhhhhLLhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhHhh.',
      '.hhHHhhhhH...Hh.',
      '.hh..........hh.',
      '.h............h.',
    ],
    back: [
      '......hhhh......',
      '.....hhLhhh.....',
      '....hhhhhhhh....',
      '..hhhhHHHHhhhh..',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhLLhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.HhhhhhhhhhhhhH.',
      '..HhhhhhhhhhhH..',
      '...HHhhhhhhHH...',
      '....SHHHHHHS....',
    ],
  },
  wavy: {
    front: [
      '................',
      '.....hhhhhh.....',
      '...hhhhLLhhhh...',
      '..hhhhLLhhhhhh..',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhHhhhHhhhHhhh.',
      '.hh..........hh.',
      'hh............hh',
      '.hh..........hh.',
      'hh............hh',
      '.hH..........Hh.',
    ],
    behind: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      'hhh..........hhh',
      '.hh..........hh.',
      'hhh..........hhh',
      '.hh..........hh.',
      'hhh..........hhh',
      '.hhh........hhh.',
      'hhL..........Lhh',
      '.hh..........hh.',
      'hhH..........Hhh',
      '.HH..........HH.',
    ],
    back: [
      '................',
      '.....hhhhhh.....',
      '...hhhhhhhhhh...',
      '..hhhhhhhhhhhh..',
      '.hhhhhhLLhhhhhh.',
      '.hhhhhLLhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      'hhhhhhhhhhhhhhhh',
      '.hhhhhhhhhhhhhh.',
      'hhhhhhhhhhhhhhhh',
      '.hhhhhhhhhhhhhh.',
      'hhhhhhhLhhhhhhhh',
      '.hhhhhhhhhhhhhh.',
      'hhhhhhhhhhhhhhhh',
      '.hhhhhhhhhhhhhh.',
      '.hHhhhhhhhhhhHh.',
      '..HhHhHhhHhHhH..',
    ],
  },
  pigtails: {
    front: [
      '................',
      '.....hhhhhh.....',
      '...hhhhLLhhhh...',
      '..hhhhLLhhhhhh..',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhHhhHhhHhhHhh.',
      '.hh..........hh.',
      '.h............h.',
    ],
    behind: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      'hh............hh',
      'hh............hh',
      'hhh..........hhh',
      'hhh..........hhh',
      'hhh..........hhh',
      '.hh..........hh.',
      '.hH..........Hh.',
      '..H..........H..',
    ],
    back: [
      '................',
      '.....hhhhhh.....',
      '...hhhhhhhhhh...',
      '..hhhhhhhhhhhh..',
      '.hhhhhhLLhhhhhh.',
      '.hhhhhLLhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      '.hhhhhhhhhhhhhh.',
      'hhHhhhhhhhhhhHhh',
      'hh.HhhhhhhhhH.hh',
      'hhh..HHHHHH..hhh',
      'hhh..SSSSSS..hhh',
      'hhh..........hhh',
      '.hh..........hh.',
      '.hH..........Hh.',
      '..H..........H..',
    ],
  },
}

// 앉은 몸통(앞모습). 0행이 어깨, 7행부터 책상 위에 올린 손이다.
const TORSO_FRONT: Record<'type0' | 'type1' | 'rest' | 'mouse' | 'write0' | 'write1' | 'oneArm', PixelMap> = {
  type0: [
    '.....tttttt.....',
    '...tttttttttt...',
    '..TttttttttttT..',
    '.TTttttttttttTT.',
    '.TTttttttttttTT.',
    '.TTTttttttttTTT.',
    '..TTTttttttTTT..',
    '...ss.......ss..',
    '............ss..',
  ],
  type1: [
    '.....tttttt.....',
    '...tttttttttt...',
    '..TttttttttttT..',
    '.TTttttttttttTT.',
    '.TTttttttttttTT.',
    '.TTTttttttttTTT.',
    '..TTTttttttTTT..',
    '..ss.......ss...',
    '..ss............',
  ],
  rest: [
    '.....tttttt.....',
    '...tttttttttt...',
    '..TttttttttttT..',
    '.TTttttttttttTT.',
    '.TTttttttttttTT.',
    '.TTTttttttttTTT.',
    '..TTTttttttTTT..',
    '...sss....sss...',
  ],
  mouse: [
    '.....tttttt.....',
    '...tttttttttt...',
    '..TttttttttttT..',
    '.TTttttttttttTT.',
    'TTTttttttttttTT.',
    'TT.tttttttttTTT.',
    'T..TTttttttTTT..',
    'ss.......sss....',
  ],
  write0: [
    '.....tttttt.....',
    '...tttttttttt...',
    '..TttttttttttT..',
    '.TTttttttttttTT.',
    '.TTttttttttttTT.',
    '.TTTttttttttTTT.',
    '..TTTttttttTTT..',
    '...sss....sk....',
    '..........s.....',
  ],
  write1: [
    '.....tttttt.....',
    '...tttttttttt...',
    '..TttttttttttT..',
    '.TTttttttttttTT.',
    '.TTttttttttttTT.',
    '.TTTttttttttTTT.',
    '..TTTttttttTTT..',
    '...sss.....sk...',
    '...........s....',
  ],
  // 한쪽 팔을 들어 올린 동작(마시기·전화·턱 괴기)의 나머지 팔
  oneArm: [
    '.....tttttt.....',
    '...tttttttttt...',
    '..TttttttttttT..',
    '.TTttttttttttT..',
    '.TTtttttttttt...',
    '.TTTtttttttt....',
    '..TTTttttttT....',
    '...sss..........',
  ],
}

// 앉은 몸통(뒷모습). 의자 등받이가 3행 아래를 가린다.
const TORSO_BACK: Record<'type0' | 'type1' | 'oneArm' | 'noArms', PixelMap> = {
  type0: [
    '.....tttttt.....',
    '...tttttttttt...',
    '..tttttttttttt..',
    '.Tttttttttttttt.',
    '.TtttttttttttttT',
    '..tttttttttttt.T',
    '..tttttttttttt..',
    '..TTTTTTTTTTTT..',
    '..TTTTTTTTTTTT..',
  ],
  type1: [
    '.....tttttt.....',
    '...tttttttttt...',
    '..tttttttttttt..',
    '.ttttttttttttT..',
    'TtttttttttttttT.',
    'T.tttttttttttt..',
    '..tttttttttttt..',
    '..TTTTTTTTTTTT..',
    '..TTTTTTTTTTTT..',
  ],
  oneArm: [
    '.....tttttt.....',
    '...tttttttttt...',
    '..tttttttttttt..',
    '.Ttttttttttttt..',
    '.Tttttttttttttt.',
    '..tttttttttttt..',
    '..tttttttttttt..',
    '..TTTTTTTTTTTT..',
    '..TTTTTTTTTTTT..',
  ],
  noArms: [
    '.....tttttt.....',
    '...tttttttttt...',
    '..tttttttttttt..',
    '..tttttttttttt..',
    '..tttttttttttt..',
    '..tttttttttttt..',
    '..tttttttttttt..',
    '..TTTTTTTTTTTT..',
    '..TTTTTTTTTTTT..',
  ],
}

// 상의 모양별 앞모습 장식(몸통 0행 기준)
export const TOP_FRONT: Record<TopStyle, PixelMap> = {
  tee: ['......TssT......', '.......TT.......'],
  shirt: ['.....iissii.....', '......i..i......', '.......I........', '................', '.......I........'],
  hoodie: ['....TTTssTTT....', '......w..w......', '......w..w......', '................'],
  cardigan: ['......TiiT......', '.......ii.......', '......TiiT......', '.......Ii.......', '......TiiT......', '.......Ii.......'],
  knit: ['......TTTT......', '................', '................', '..TtTtTtTtTtTt..'],
  blazer: ['......iiii......', '.....TiiiiT.....', '......TiiT......', '.......TT.......', '.......I........'],
}

// 상의 모양별 뒷모습 장식
export const TOP_BACK: Partial<Record<TopStyle, PixelMap>> = {
  hoodie: ['...TTTTTTTTTT...', '....TTTTTTTT....', '.....TTTTTT.....'],
  blazer: ['................', '................', '.......TT.......', '.......TT.......', '.......TT.......'],
  shirt: ['.....iiiiii.....'],
}

export const LANYARD_FRONT: PixelMap = [
  '.....a....a.....',
  '......a..a......',
  '.......aa.......',
  '.......ww.......',
  '.......ww.......',
]

export const GLASSES_FRONT: Record<'square' | 'round', PixelMap> = {
  square: [
    '....ggg..ggg....',
    '....g.gggg.g....',
    '....g.g..g.g....',
    '....ggg..ggg....',
  ],
  round: [
    '.....g....g.....',
    '....g.gggg.g....',
    '....g.g..g.g....',
    '.....g....g.....',
  ],
}

export const HEADPHONES_FRONT: PixelMap = [
  '....kkkkkkkk....',
  '..kk........kk..',
  '.k............k.',
  '.k............k.',
  '.k............k.',
  '.k............k.',
  'aa............aa',
  'aa............aa',
  'aa............aa',
]

export const HEADPHONES_BACK: PixelMap = [
  '....kkkkkkkk....',
  '..kkkkkkkkkkkk..',
  '.k............k.',
  '.k............k.',
  '.k............k.',
  '.k............k.',
  'aa............aa',
  'aa............aa',
  'aa............aa',
]

export const HAIR_ACCESSORY_FRONT: Record<'pin' | 'ribbon', PixelMap> = {
  pin: ['................', '................', '................', '..........aa....'],
  ribbon: ['...........a.a..', '...........aaa..', '...........a.a..'],
}

// 표정(앞모습). 얼굴 픽셀맵 8행이 눈 윗줄이다.
export const EYES: Record<SpriteExpression, PixelMap> = {
  normal: ['.....e....e.....', '.....e....e.....'],
  blink: ['................', '....ee....ee....'],
  happy: ['.....e....e.....', '....e.e..e.e....'],
  focus: ['................', '.....e....e.....'],
  glance: ['......e....e....', '......e....e....'],
  surprised: ['....ee....ee....', '....ee....ee....'],
}

// 머리 위로 올린 팔·손에 든 소품. 얼굴과 머리카락 위에 마지막으로 찍는다.
// 20칸 너비로 격자 왼쪽 끝부터 놓고, y는 머리 픽셀맵 0행 기준이다(위로 네 칸 여유).
type RaisedArm = { map: PixelMap; y: number }
type RaisedPose = 'stretch0' | 'stretch1' | 'sip' | 'think' | 'phone'

// 기지개: 두 팔을 머리 위로 올려 손을 맞잡는다. 두 장이 번갈아 나오며 위로 쭉 뻗는다.
const STRETCH: Record<'stretch0' | 'stretch1', RaisedArm> = {
  stretch0: {
    y: -3,
    map: [
      '........ssss........',
      '.......tssssT.......',
      '.....ttT....Ttt.....',
      '....tT........Tt....',
      '...tT..........Tt...',
      '...tT..........Tt...',
      '..tT............Tt..',
      '..tT............Tt..',
      '..tT............Tt..',
    ],
  },
  stretch1: {
    y: -4,
    map: [
      '........ssss........',
      '.......tssssT.......',
      '......tT....Tt......',
      '.....tT......Tt.....',
      '....tT........Tt....',
      '...tT..........Tt...',
      '...tT..........Tt...',
      '..tT............Tt..',
      '..tT............Tt..',
      '..tT............Tt..',
    ],
  },
}

export const RAISED_FRONT: Record<RaisedPose, RaisedArm> = {
  ...STRETCH,
  sip: {
    y: 10,
    map: [
      '..........yyy.......',
      '..........yyyY......',
      '..........yyy.......',
      '...........ss.......',
      '............tT......',
      '.............tT.....',
      '..............tT....',
      '..............tT....',
      '..............tT....',
      '..............tT....',
      '.............ttT....',
    ],
  },
  think: {
    y: 10,
    map: [
      '............ss......',
      '............ss......',
      '.............tT.....',
      '..............tT....',
      '..............tT....',
      '..............tT....',
      '..............tT....',
      '.............ttT....',
    ],
  },
  phone: {
    // 팔꿈치를 몸 옆에 붙이고 전화기를 귀에 댄다
    y: 7,
    map: [
      '................kk..',
      '...............skk..',
      '...............skk..',
      '...............ss...',
      '..............tT....',
      '..............tT....',
      '..............tT....',
      '.............ttT....',
      '.............ttT....',
    ],
  },
}

const RAISED_BACK: Record<RaisedPose, RaisedArm> = {
  ...STRETCH,
  sip: {
    y: 9,
    map: [
      '................yy..',
      '................yY..',
      '...............ss...',
      '...............tT...',
      '..............tT....',
      '..............tT....',
      '..............tT....',
      '..............tT....',
      '..............tT....',
    ],
  },
  think: {
    // 머리 옆을 긁는 짧은 팔(손은 귀 옆 높이)
    y: 8,
    map: [
      '.................ss.',
      '.................ss.',
      '................tT..',
      '................tT..',
      '...............tT...',
      '...............tT...',
    ],
  },
  phone: {
    // 귀에 댄 전화기와 짧은 팔(어깨에서 끝난다)
    y: 7,
    map: [
      '................kk..',
      '................kk..',
      '...............ss...',
      '...............tT...',
      '...............tT...',
      '..............tT....',
      '..............tT....',
    ],
  },
}

export function createGrid(width = SPRITE_WIDTH, height = SPRITE_HEIGHT): PixelGrid {
  return { width, height, pixels: new Array(width * height).fill(null) }
}

export function stamp(grid: PixelGrid, map: PixelMap, x: number, y: number, palette: Palette) {
  for (let row = 0; row < map.length; row += 1) {
    const line = map[row]
    const gridY = y + row
    if (gridY < 0 || gridY >= grid.height) continue
    for (let column = 0; column < line.length; column += 1) {
      const key = line[column]
      if (key === '.') continue
      const color = palette[key]
      if (!color) continue
      const gridX = x + column
      if (gridX < 0 || gridX >= grid.width) continue
      grid.pixels[gridY * grid.width + gridX] = color
    }
  }
}

/** 실루엣 둘레(상하좌우로 맞닿은 투명 칸)에 외곽선을 두른다. */
export function outlineGrid(grid: PixelGrid, color = OUTLINE_COLOR): PixelGrid {
  const next = [...grid.pixels]
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (grid.pixels[y * grid.width + x]) continue
      const touches =
        (x > 0 && grid.pixels[y * grid.width + x - 1])
        || (x < grid.width - 1 && grid.pixels[y * grid.width + x + 1])
        || (y > 0 && grid.pixels[(y - 1) * grid.width + x])
        || (y < grid.height - 1 && grid.pixels[(y + 1) * grid.width + x])
      if (touches) next[y * grid.width + x] = color
    }
  }
  return { ...grid, pixels: next }
}

function shadeHex(hex: string, amount: number) {
  const value = Number.parseInt(hex.slice(1), 16)
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) * (1 - amount))))
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`
}

export function paletteFor(look: OfficeLook): Palette {
  return {
    s: look.skin[0],
    S: look.skin[1],
    h: look.hair[0],
    H: look.hair[1],
    L: look.hair[2],
    t: look.topColor[0],
    T: look.topColor[1],
    i: look.inner[0],
    I: look.inner[1],
    p: look.pants[0],
    P: look.pants[1],
    f: SHOE_COLOR,
    e: EYE_COLOR,
    b: BLUSH_COLOR,
    m: MOUTH_COLOR,
    g: look.glasses === 'round' ? GOLD_FRAME_COLOR : FRAME_COLOR,
    a: look.accent,
    k: DARK_PROP_COLOR,
    w: WHITE_COLOR,
    y: look.mug,
    c: CHAIR_COLOR,
    C: CHAIR_LIGHT,
  }
}

const accessoryPaletteCache = new Map<string, string>()
export function accentShade(color: string) {
  let shade = accessoryPaletteCache.get(color)
  if (!shade) {
    shade = shadeHex(color, 0.25)
    accessoryPaletteCache.set(color, shade)
  }
  return shade
}

function torsoFrontFor(pose: SpritePose, frame: number): PixelMap {
  switch (pose) {
    case 'type':
    case 'nod':
      return frame % 2 === 0 ? TORSO_FRONT.type0 : TORSO_FRONT.type1
    case 'mouse':
      return TORSO_FRONT.mouse
    case 'write':
      return frame % 2 === 0 ? TORSO_FRONT.write0 : TORSO_FRONT.write1
    case 'sip':
    case 'think':
    case 'phone':
      return TORSO_FRONT.oneArm
    case 'stretch':
      return TORSO_BACK.noArms
    default:
      return TORSO_FRONT.rest
  }
}

function torsoBackFor(pose: SpritePose, frame: number): PixelMap {
  switch (pose) {
    case 'type':
    case 'nod':
    case 'write':
    case 'mouse':
      return frame % 2 === 0 ? TORSO_BACK.type0 : TORSO_BACK.type1
    case 'sip':
    case 'think':
    case 'phone':
      return TORSO_BACK.oneArm
    case 'stretch':
      return TORSO_BACK.noArms
    default:
      return TORSO_BACK.type0
  }
}

function raisedFor(pose: SpritePose, frame: number): RaisedPose | null {
  if (pose === 'stretch') return frame % 2 === 0 ? 'stretch0' : 'stretch1'
  if (pose === 'sip' || pose === 'think' || pose === 'phone') return pose
  return null
}

/**
 * 앉은 캐릭터 한 장을 합성한다. 앞모습은 뒷줄(얼굴이 보이는 줄), 뒷모습은 앞줄이다.
 * 결과는 외곽선까지 두른 20×28 격자다.
 */
export function composeSeatedSprite(look: OfficeLook, sprite: SpriteFrame): PixelGrid {
  const grid = createGrid()
  const palette = { ...paletteFor(look), A: accentShade(look.accent) }
  const hair = HAIR[look.hairStyle]
  const headY = HEAD_Y + (sprite.headDrop ?? 0)
  const raised = raisedFor(sprite.pose, sprite.frame)

  if (sprite.view === 'front') {
    if (hair.behind) stamp(grid, hair.behind, MAP_X, headY, palette)
    stamp(grid, torsoFrontFor(sprite.pose, sprite.frame), MAP_X, TORSO_Y, palette)
    stamp(grid, TOP_FRONT[look.top], MAP_X, TORSO_Y, palette)
    if (look.lanyard && look.top !== 'hoodie') stamp(grid, LANYARD_FRONT, MAP_X, TORSO_Y, palette)
    stamp(grid, FACE_FRONT, MAP_X, headY, palette)
    stamp(grid, EYES[sprite.expression], MAP_X, headY + 8, palette)
    if (look.blush) stamp(grid, ['....b......b....'], MAP_X, headY + 10, palette)
    if (sprite.expression === 'surprised' || sprite.pose === 'phone') {
      stamp(grid, ['.......mm.......'], MAP_X, headY + 11, palette)
    }
    if (look.glasses !== 'none') stamp(grid, GLASSES_FRONT[look.glasses], MAP_X, headY + 7, palette)
    stamp(grid, hair.front, MAP_X, headY, palette)
    if (look.hairAccessory !== 'none') stamp(grid, HAIR_ACCESSORY_FRONT[look.hairAccessory], MAP_X, headY, palette)
    if (look.headphones) stamp(grid, HEADPHONES_FRONT, MAP_X, headY, palette)
    if (raised) stamp(grid, RAISED_FRONT[raised].map, 0, HEAD_Y + RAISED_FRONT[raised].y, palette)
  } else {
    stamp(grid, torsoBackFor(sprite.pose, sprite.frame), MAP_X, TORSO_Y, palette)
    const topBack = TOP_BACK[look.top]
    if (topBack) stamp(grid, topBack, MAP_X, TORSO_Y, palette)
    stamp(grid, HEAD_BACK, MAP_X, headY, palette)
    stamp(grid, hair.back, MAP_X, headY, palette)
    if (look.hairAccessory === 'ribbon') stamp(grid, ['......a.a.......', '......aaa.......'], MAP_X, headY + 1, palette)
    if (look.headphones) stamp(grid, HEADPHONES_BACK, MAP_X, headY, palette)
    if (raised) stamp(grid, RAISED_BACK[raised].map, 0, HEAD_Y + RAISED_BACK[raised].y, palette)
  }

  return outlineGrid(grid)
}

/** 자리 배치 창의 미리보기용 상반신(앞모습, 가만히 있는 자세). */
export function composePortrait(look: OfficeLook): PixelGrid {
  return composeSeatedSprite(look, { view: 'front', pose: 'idle', frame: 0, expression: 'normal' })
}

export const HAIR_STYLE_IDS = Object.keys(HAIR) as HairStyle[]

/** 테스트용: 모든 픽셀맵의 너비가 16칸인지 확인할 수 있게 목록을 내보낸다. */
export function allPixelMapsForTest(): Array<[string, PixelMap]> {
  const entries: Array<[string, PixelMap]> = [
    ['FACE_FRONT', FACE_FRONT],
    ['HEAD_BACK', HEAD_BACK],
    ['LANYARD_FRONT', LANYARD_FRONT],
    ['HEADPHONES_FRONT', HEADPHONES_FRONT],
    ['HEADPHONES_BACK', HEADPHONES_BACK],
  ]
  for (const [style, maps] of Object.entries(HAIR)) {
    entries.push([`HAIR.${style}.front`, maps.front], [`HAIR.${style}.back`, maps.back])
    if (maps.behind) entries.push([`HAIR.${style}.behind`, maps.behind])
  }
  for (const [name, map] of Object.entries(TORSO_FRONT)) entries.push([`TORSO_FRONT.${name}`, map])
  for (const [name, map] of Object.entries(TORSO_BACK)) entries.push([`TORSO_BACK.${name}`, map])
  for (const [name, map] of Object.entries(TOP_FRONT)) entries.push([`TOP_FRONT.${name}`, map])
  for (const [name, map] of Object.entries(TOP_BACK)) if (map) entries.push([`TOP_BACK.${name}`, map])
  for (const [name, map] of Object.entries(GLASSES_FRONT)) entries.push([`GLASSES_FRONT.${name}`, map])
  for (const [name, map] of Object.entries(HAIR_ACCESSORY_FRONT)) entries.push([`HAIR_ACCESSORY_FRONT.${name}`, map])
  for (const [name, map] of Object.entries(EYES)) entries.push([`EYES.${name}`, map])
  for (const [name, raised] of Object.entries(RAISED_FRONT)) entries.push([`RAISED_FRONT.${name}`, raised.map])
  for (const [name, raised] of Object.entries(RAISED_BACK)) entries.push([`RAISED_BACK.${name}`, raised.map])
  return entries
}

/** 책상 서류 한 묶음. 사무실의 기존 종이·프레임 팔레트를 쓴다. */
export const DESK_PAPERS: PixelGrid = {
  width: 12, height: 8,
  pixels: ['............', '.kkkkkkkkkk.', '.kwwwwwwwwk.', '.kkkkkkkkkk.', '.kwwwwwwwwk.', '.kkkkkkkkkk.', '............', '............'].join('').split('').map(c => c === 'k' ? '#263448' : c === 'w' ? '#ffffff' : null),
}
