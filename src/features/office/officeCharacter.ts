import { OFFICE_STYLE_SEED_MAX } from '../../data/validation/officeSeats'
import type { OfficeGender } from '../../types'

/**
 * 사무실 캐릭터의 모습과 개성.
 * 파트장이 고른 성별과 저장된 스타일 시드만으로 결정되므로, 누가 어느 화면에서 보든 같은 캐릭터가 나온다.
 * 시드를 바꾸는 것(‘다시 뽑기’)이 스타일과 개성을 새로 정하는 유일한 방법이다.
 */

export type { OfficeGender }

export const OFFICE_GENDERS: readonly OfficeGender[] = ['male', 'female']

export const OFFICE_GENDER_LABELS: Record<OfficeGender, string> = {
  male: '남성',
  female: '여성',
}

export const MALE_HAIR_STYLES = ['neat', 'dandy', 'twoBlock', 'perm', 'spiky', 'buzz'] as const
export const FEMALE_HAIR_STYLES = ['long', 'bob', 'ponytail', 'bun', 'wavy', 'pigtails'] as const
export type HairStyle = (typeof MALE_HAIR_STYLES)[number] | (typeof FEMALE_HAIR_STYLES)[number]

export type TopStyle = 'tee' | 'shirt' | 'hoodie' | 'cardigan' | 'knit' | 'blazer'
export type GlassesStyle = 'none' | 'square' | 'round'
export type ScreenKind = 'document' | 'sheet' | 'report' | 'chat' | 'chart'
export type DeskItem = 'none' | 'plant' | 'cactus' | 'photo' | 'figure' | 'binder' | 'vials'
export type HairAccessory = 'none' | 'pin' | 'ribbon'

/** 밝은 색, 그림자 색 순서의 두 톤. 머리카락은 하이라이트까지 세 톤이다. */
export type TwoTone = readonly [base: string, shade: string]
export type ThreeTone = readonly [base: string, shade: string, light: string]

export type PersonalityId =
  | 'typist'
  | 'coffee'
  | 'thinker'
  | 'stretcher'
  | 'music'
  | 'memo'
  | 'caller'
  | 'checker'

export type OfficePersonality = {
  id: PersonalityId
  /** 화면에 보이는 개성 이름 */
  label: string
  /** 자리 배치 창에서 개성 이름 옆에 붙는 한 줄 설명 */
  description: string
  /** 가끔 머리 위 말풍선으로 하는 말 */
  lines: readonly string[]
}

export type OfficeLook = {
  gender: OfficeGender
  hairStyle: HairStyle
  hair: ThreeTone
  skin: TwoTone
  top: TopStyle
  topColor: TwoTone
  inner: TwoTone
  pants: TwoTone
  glasses: GlassesStyle
  headphones: boolean
  lanyard: boolean
  blush: boolean
  hairAccessory: HairAccessory
  /** 헤드폰·머리핀·리본·사원증 줄에 쓰는 포인트 색 */
  accent: string
  mug: string
  deskItem: DeskItem
  screen: ScreenKind
}

export type OfficeCharacter = {
  seed: number
  look: OfficeLook
  personality: OfficePersonality
}

export const OFFICE_PERSONALITIES: readonly OfficePersonality[] = [
  {
    id: 'typist',
    label: '보고서 장인',
    description: '일탈·CAPA 보고서를 누구보다 빨리 써요',
    lines: ['일탈 보고서 마무리 중…', 'CAPA 계획서 초안 끝!', '오늘 안에 보고서 올릴게요'],
  },
  {
    id: 'coffee',
    label: '커피 수혈러',
    description: '배치 기록 검토 전엔 꼭 커피 한 잔',
    lines: ['카페인 충전 완료!', '검토 전엔 커피부터', '아아 한 잔이면 배치 하나 끝'],
  },
  {
    id: 'thinker',
    label: '원인 분석가',
    description: '고민 끝에 근본 원인을 찾아내요',
    lines: ['근본 원인이 뭘까…', '아하, 이거였네!', '5 Why 한 번 더 돌려 보자'],
  },
  {
    id: 'stretcher',
    label: '스트레칭 요정',
    description: '실사 대비로 몸도 틈틈이 풀어요',
    lines: ['으쌰, 허리 쭉!', '실사 전에 몸부터 풀자', '잠깐 스트레칭'],
  },
  {
    id: 'music',
    label: '리듬 타는 집중러',
    description: '헤드폰을 끼고 SOP를 정독해요',
    lines: ['흥얼흥얼~', 'SOP 정독 모드', '집중 모드 켜짐'],
  },
  {
    id: 'memo',
    label: '꼼꼼 기록왕',
    description: 'GMP 기록은 빠짐없이 남겨요',
    lines: ['ALCOA+ 지켜서 기록!', '기록 없으면 안 한 거예요', '체크리스트 완성!'],
  },
  {
    id: 'caller',
    label: '위탁사 소통왕',
    description: '위탁 제조소와 척척 조율해요',
    lines: ['네, 시험성적서 확인할게요', '제조소에 바로 공유할게요', '회신 받았어요!'],
  },
  {
    id: 'checker',
    label: '매의 눈 검토왕',
    description: '규격 밖 수치를 귀신같이 찾아요',
    lines: ['일탈 발견!', '이 수치 규격 벗어났는데…', '배치 기록 검토 끝!'],
  },
]

const SKIN_TONES: ReadonlyArray<readonly [TwoTone, number]> = [
  [['#fde3cf', '#eab99c'], 30],
  [['#f6d0b0', '#dca783'], 34],
  [['#e9bd94', '#c99670'], 20],
  [['#d09a6e', '#ad774e'], 10],
  [['#a56d48', '#80502f'], 6],
]

const HAIR_COLORS: ReadonlyArray<readonly [ThreeTone, number]> = [
  [['#35303b', '#1e1b22', '#57505f'], 30],
  [['#4d3226', '#301e16', '#71503d'], 24],
  [['#704731', '#4c2e1f', '#98664a'], 14],
  [['#8e5634', '#663b22', '#b87849'], 8],
  [['#7b6b61', '#574a41', '#a08f83'], 7],
  [['#c48f4b', '#946832', '#e3b677'], 6],
  [['#723047', '#4d1d2d', '#9a4a64'], 5],
  [['#b6bcc7', '#8a909b', '#dfe3ea'], 3],
  [['#35476f', '#22304e', '#566c9d'], 3],
]

const TOP_COLORS: readonly TwoTone[] = [
  ['#f2f3ef', '#c9ced2'],
  ['#b8d4f1', '#8aaed5'],
  ['#34497a', '#223257'],
  ['#4b515d', '#33373f'],
  ['#a6adb8', '#7f8793'],
  ['#dccaa6', '#b6a17c'],
  ['#7f8d52', '#5d6939'],
  ['#a6dcc6', '#7cb9a2'],
  ['#f3b9c7', '#d68ea2'],
  ['#e5b545', '#bb8c28'],
  ['#b85c43', '#8d422e'],
  ['#c6b9e8', '#9e90c8'],
  ['#2e3037', '#1b1c21'],
  ['#4a8b63', '#336646'],
  ['#f28b73', '#cd6650'],
]

const INNER_COLORS: readonly TwoTone[] = [
  ['#ffffff', '#d5dae0'],
  ['#dcebfb', '#aec8e6'],
  ['#fbe3ea', '#e1b4c2'],
  ['#f6efdc', '#d8ccae'],
]

const PANTS_COLORS: readonly TwoTone[] = [
  ['#2f3b57', '#1f283d'],
  ['#3c3f47', '#27292f'],
  ['#d3c3a2', '#ae9c79'],
  ['#4f6f9e', '#374f75'],
  ['#8b919b', '#686d76'],
]

const ACCENT_COLORS = ['#ffcc3d', '#e2554b', '#3d7bd8', '#43b596', '#ff8fb3', '#8a63d2'] as const
const MUG_COLORS = ['#f4f4f0', '#ffcc3d', '#e2554b', '#3d7bd8', '#43b596', '#ff8fb3', '#34363d'] as const

const TOP_STYLES: ReadonlyArray<readonly [TopStyle, number]> = [
  ['tee', 20],
  ['shirt', 22],
  ['hoodie', 14],
  ['cardigan', 16],
  ['knit', 14],
  ['blazer', 14],
]

const DESK_ITEMS: ReadonlyArray<readonly [DeskItem, number]> = [
  ['none', 12],
  ['plant', 16],
  ['cactus', 10],
  ['photo', 14],
  ['figure', 10],
  ['binder', 20],
  ['vials', 18],
]

const SCREEN_KINDS: readonly ScreenKind[] = ['document', 'sheet', 'report', 'chat', 'chart']

/** 32비트 정수 시드로 도는 작은 의사난수 생성기(mulberry32). 같은 시드는 늘 같은 순서를 낸다. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let next = Math.imul(state ^ (state >>> 15), state | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

export function pickFrom<T>(items: readonly T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]
}

function pickWeighted<T>(items: ReadonlyArray<readonly [T, number]>, random: () => number): T {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [item, weight] of items) {
    roll -= weight
    if (roll < 0) return item
  }
  return items[items.length - 1][0]
}

/** ‘다시 뽑기’용 새 시드. 브라우저 암호 난수를 쓰고, 없으면 Math.random으로 대신한다. */
export function createStyleSeed(): number {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(1)
    cryptoApi.getRandomValues(values)
    return values[0] & OFFICE_STYLE_SEED_MAX
  }
  return Math.floor(Math.random() * OFFICE_STYLE_SEED_MAX)
}

export function personalityById(id: PersonalityId): OfficePersonality {
  return OFFICE_PERSONALITIES.find((item) => item.id === id) ?? OFFICE_PERSONALITIES[0]
}

/**
 * 성별과 시드로 캐릭터를 만든다. 뽑는 순서를 바꾸면 이미 저장된 시드의 캐릭터가 달라지므로,
 * 새 속성은 늘 맨 뒤에 추가한다.
 */
export function resolveOfficeCharacter(gender: OfficeGender, seed: number): OfficeCharacter {
  const random = seededRandom(seed)
  const personality = pickFrom(OFFICE_PERSONALITIES, random)
  const hairStyle = pickFrom<HairStyle>(gender === 'male' ? MALE_HAIR_STYLES : FEMALE_HAIR_STYLES, random)
  const hair = pickWeighted(HAIR_COLORS, random)
  const skin = pickWeighted(SKIN_TONES, random)
  const top = pickWeighted(TOP_STYLES, random)
  const topColor = pickFrom(TOP_COLORS, random)
  const inner = pickFrom(INNER_COLORS, random)
  const pants = pickFrom(PANTS_COLORS, random)
  const glassesRoll = random()
  const glasses: GlassesStyle = glassesRoll < 0.18 ? 'square' : glassesRoll < 0.3 ? 'round' : 'none'
  const headphones = personality.id === 'music' || random() < 0.06
  const lanyard = random() < 0.45
  const blush = random() < (gender === 'female' ? 0.75 : 0.25)
  const accessoryRoll = random()
  const hairAccessory: HairAccessory = gender === 'female'
    ? accessoryRoll < 0.22 ? 'pin' : accessoryRoll < 0.36 ? 'ribbon' : 'none'
    : 'none'
  const accent = pickFrom(ACCENT_COLORS, random)
  const mug = pickFrom(MUG_COLORS, random)
  const deskItem = pickWeighted(DESK_ITEMS, random)
  const screen = personality.id === 'checker' ? 'report' : pickFrom(SCREEN_KINDS, random)

  return {
    seed,
    personality,
    look: {
      gender,
      hairStyle,
      hair,
      skin,
      top,
      topColor,
      inner,
      pants,
      glasses,
      headphones,
      lanyard,
      blush,
      hairAccessory,
      accent,
      mug,
      deskItem,
      screen,
    },
  }
}
