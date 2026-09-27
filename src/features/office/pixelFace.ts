import { resolveOfficeCharacter, type OfficeLook } from './officeCharacter'
import { composePortrait, createGrid, type PixelGrid } from './officeSprites'
import type { OfficeLayout } from '../../types'

/** 얼굴 칸 크기(정사각형). 앉은 모습 한 장에서 머리와 어깨만 잘라 낸다. */
export const FACE_SIZE = 20
/** 앉은 모습에서 얼굴을 자르기 시작하는 행(머리카락 위 여백 바로 아래) */
const FACE_TOP = 2

const faceCache = new WeakMap<OfficeLook, PixelGrid>()

/** 사무실 캐릭터의 얼굴(머리와 어깨, 20×20). 같은 캐릭터는 한 번만 만든다. */
export function faceGrid(look: OfficeLook): PixelGrid {
  const cached = faceCache.get(look)
  if (cached) return cached
  const portrait = composePortrait(look)
  const face = createGrid(FACE_SIZE, FACE_SIZE)
  for (let y = 0; y < FACE_SIZE; y += 1) {
    for (let x = 0; x < FACE_SIZE; x += 1) {
      face.pixels[y * FACE_SIZE + x] = portrait.pixels[(y + FACE_TOP) * portrait.width + x] ?? null
    }
  }
  faceCache.set(look, face)
  return face
}

const lookCache = new Map<string, OfficeLook>()

function lookOf(gender: OfficeLayout['seats'][number]['gender'], seed: number): OfficeLook {
  const key = `${gender}:${seed}`
  let look = lookCache.get(key)
  if (!look) {
    look = resolveOfficeCharacter(gender, seed).look
    lookCache.set(key, look)
  }
  return look
}

/** 사무실에 앉은 사람의 캐릭터 모습. id로 먼저 찾고, 모르면 이름으로 찾는다(없으면 null). */
export function lookForPerson(layout: OfficeLayout | undefined, profileId?: string | null, name?: string | null): OfficeLook | null {
  const seat = (profileId ? layout?.seats.find((item) => item.profile_id === profileId) : undefined)
    ?? (name ? layout?.seats.find((item) => item.name === name) : undefined)
  return seat ? lookOf(seat.gender, seat.style_seed) : null
}
