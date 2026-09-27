import type { PresenceKind } from '../../data/validation/memberPresence'
import type { Palette, PixelGrid, PixelMap } from './officeSprites'

/**
 * 12×12 도트 아이콘. 사무실 자리 표지(말풍선 안)와 상태 고르는 창·목록 칩에서 같은 그림을 쓴다.
 * 글자 하나가 색 하나다(`.`은 투명). 외곽선(o)을 직접 그려 작은 크기에서도 모양이 또렷하다.
 */

export type PixelIconId = PresenceKind | 'present'

export const PIXEL_ICON_SIZE = 12

export const PIXEL_ICON_PALETTE: Palette = {
  o: '#231a1f',
  w: '#fbfbf7',
  W: '#dfe3ea',
  y: '#ffcc3d',
  Y: '#d9a21c',
  r: '#e2554b',
  R: '#b53a32',
  g: '#43b596',
  G: '#2e8a6e',
  b: '#3d7bd8',
  B: '#2b5aa8',
  l: '#a8d8f5',
  n: '#a47a52',
  N: '#6b4a2f',
  s: '#f3dca3',
  k: '#5b6069',
  K: '#c9ccd2',
}

export const PIXEL_ICONS: Record<PixelIconId, PixelMap> = {
  // 자리에 있음: 초록 동그라미 체크
  present: [
    '....oooo....',
    '..ooggggoo..',
    '.oggggggggo.',
    '.oggggggggo.',
    'oggggggggwgo',
    'ogggggggwggo',
    'oggwgggwgggo',
    'ogggwgwggggo',
    '.ogggwggggo.',
    '.oggggggggo.',
    '..ooggggoo..',
    '....oooo....',
  ],
  // 휴가: 파라솔과 모래사장
  vacation: [
    '....oooo....',
    '..oorwwroo..',
    '.orrrwwrrro.',
    'orrrrwwrrrro',
    'ooooooNooooo',
    '......N.....',
    '......N.....',
    '......N.....',
    '......N.....',
    '..ossssssso.',
    '.ossssssssso',
    '.ooooooooooo',
  ],
  // 출장: 손잡이 달린 여행 가방
  trip: [
    '............',
    '....oooo....',
    '....o..o....',
    '.oooooooooo.',
    '.olllllllbo.',
    '.obBbbbbBbo.',
    '.obBbbbbBbo.',
    '.obbbbbbbbo.',
    '.obBbbbbBbo.',
    '.oooooooooo.',
    '..ok....ko..',
    '...o....o...',
  ],
  // 회의 중: 겹친 말풍선 둘
  meeting: [
    '.oooooo.....',
    'owwwwwwo....',
    'owkwkwko....',
    'owwwwwwo....',
    '.oowoooooo..',
    '..ooyyyyyyo.',
    '...oykykyyyo',
    '...oyyyyyyyo',
    '....oooooyo.',
    '........oo..',
    '............',
    '............',
  ],
  // 현장: 노란 안전모
  field: [
    '............',
    '............',
    '....oooo....',
    '..ooyyyYoo..',
    '.oyyyyyyYYo.',
    '.oywyyyyyYo.',
    '.oyyyyyyyYo.',
    'oooooooooooo',
    'oYYYYYYYYYYo',
    'oooooooooooo',
    '............',
    '............',
  ],
  // 실험실: 초록 시약이 든 삼각 플라스크
  lab: [
    '...oooooo...',
    '....owwo....',
    '....owwo....',
    '...owwwwo...',
    '..owwwwwwo..',
    '..oggggggo..',
    '.oggwgggggo.',
    '.ogggggwggo.',
    'oggggggggggo',
    'oGGGGGGGGGGo',
    'oooooooooooo',
    '............',
  ],
  // 기타 부재: 벽시계
  away: [
    '....oooo....',
    '..oowwwwoo..',
    '.owwwwkwwwo.',
    '.owwwwkwwwo.',
    'owwwwwkwwwwo',
    'owwwwwrkkkwo',
    'owwwwwwwwwwo',
    'owwwwwwwwwwo',
    '.owwwwwwwwo.',
    '.owwwwwwwwo.',
    '..oowwwwoo..',
    '....oooo....',
  ],
}

const iconCache = new Map<PixelIconId, PixelGrid>()

/**
 * 아이콘 한 장(12×12 격자). 같은 아이콘은 한 번만 만든다.
 * 캐릭터 도트 모듈을 불러오지 않아 첫 화면(상단 메뉴의 내 상태 단추)에서도 가볍게 쓴다.
 */
export function pixelIconGrid(id: PixelIconId): PixelGrid {
  let grid = iconCache.get(id)
  if (!grid) {
    const map = PIXEL_ICONS[id]
    const pixels: Array<string | null> = []
    for (let row = 0; row < PIXEL_ICON_SIZE; row += 1) {
      for (let column = 0; column < PIXEL_ICON_SIZE; column += 1) {
        const key = map[row]?.[column] ?? '.'
        pixels.push(key === '.' ? null : PIXEL_ICON_PALETTE[key] ?? null)
      }
    }
    grid = { width: PIXEL_ICON_SIZE, height: PIXEL_ICON_SIZE, pixels }
    iconCache.set(id, grid)
  }
  return grid
}
