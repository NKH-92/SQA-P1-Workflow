import { seededRandom, type PersonalityId } from './officeCharacter'
import type { SpriteExpression, SpritePose, SpriteView } from './officeSprites'

/**
 * 자리에 앉은 캐릭터가 스스로 고르는 동작.
 * 대부분은 타자를 치고, 개성에 따라 커피·기지개·통화·메모 같은 동작을 가끔 섞는다.
 */
export type OfficeAction =
  | 'type'
  | 'mouse'
  | 'sip'
  | 'think'
  | 'idea'
  | 'stretch'
  | 'nod'
  | 'write'
  | 'phone'
  | 'peer'
  | 'found'
  | 'look'

export type OfficeEffect = 'none' | 'think' | 'idea' | 'found' | 'music' | 'call' | 'steam'

type Weights = Partial<Record<OfficeAction, number>>

const PERSONALITY_WEIGHTS: Record<PersonalityId, Weights> = {
  typist: { type: 64, mouse: 12, sip: 6, stretch: 4, look: 6, peer: 8 },
  coffee: { type: 44, sip: 28, mouse: 12, look: 8, stretch: 8 },
  thinker: { type: 42, think: 26, mouse: 12, look: 10, sip: 10 },
  stretcher: { type: 44, stretch: 24, mouse: 12, sip: 10, look: 10 },
  music: { type: 42, nod: 34, mouse: 12, sip: 8, look: 4 },
  memo: { type: 40, write: 32, mouse: 12, sip: 8, look: 8 },
  caller: { type: 44, phone: 26, mouse: 12, sip: 10, look: 8 },
  checker: { type: 36, peer: 30, mouse: 14, sip: 8, look: 12 },
}

const DURATIONS: Record<OfficeAction, readonly [number, number]> = {
  type: [4200, 9000],
  mouse: [1800, 3400],
  sip: [2400, 3000],
  think: [2800, 4200],
  idea: [1600, 1900],
  stretch: [2000, 2600],
  nod: [3600, 6400],
  write: [3000, 4800],
  phone: [4200, 6800],
  peer: [2600, 4000],
  found: [1500, 1800],
  look: [1200, 1800],
}

/** 앞 동작이 끝나면 이어서 나오는 동작과 그 확률(고민하다 번뜩, 들여다보다 발견) */
const FOLLOW_UPS: Partial<Record<OfficeAction, readonly [OfficeAction, number]>> = {
  think: ['idea', 0.6],
  peer: ['found', 0.4],
}

/** 타자 손이 한 번 바뀌는 간격(ms). 타자왕은 더 빠르다. */
function typingInterval(personality: PersonalityId) {
  return personality === 'typist' ? 110 : 170
}

export type OfficeActor = {
  personality: PersonalityId
  action: OfficeAction
  startedAt: number
  endsAt: number
  nextBlinkAt: number
  random: () => number
}

function durationFor(action: OfficeAction, random: () => number) {
  const [min, max] = DURATIONS[action]
  return min + Math.round(random() * (max - min))
}

function pickWeighted(weights: Weights, random: () => number): OfficeAction {
  const entries = Object.entries(weights) as Array<[OfficeAction, number]>
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [action, weight] of entries) {
    roll -= weight
    if (roll < 0) return action
  }
  return 'type'
}

export function createActor(personality: PersonalityId, seed: number, now: number): OfficeActor {
  const random = seededRandom(seed ^ 0x5bd1e995)
  // 모두 같은 순간에 동작을 바꾸지 않도록 첫 동작의 남은 시간을 흩어 둔다.
  const startedAt = now - Math.round(random() * 3000)
  return {
    personality,
    action: 'type',
    startedAt,
    endsAt: now + 600 + Math.round(random() * 5200),
    nextBlinkAt: now + 800 + Math.round(random() * 3000),
    random,
  }
}

/** 다음 동작을 고른다. 특별한 동작 뒤에는 대개 다시 타자로 돌아온다. */
export function nextAction(actor: OfficeActor): OfficeAction {
  const followUp = FOLLOW_UPS[actor.action]
  if (followUp && actor.random() < followUp[1]) return followUp[0]
  if (actor.action !== 'type' && actor.random() < 0.7) return 'type'
  const picked = pickWeighted(PERSONALITY_WEIGHTS[actor.personality], actor.random)
  return picked === actor.action && picked !== 'type' ? 'type' : picked
}

/** 시간을 흘려 동작을 넘긴다. 새 동작이 시작됐으면 그 동작을, 아니면 null을 돌려준다. */
export function advanceActor(actor: OfficeActor, now: number): OfficeAction | null {
  if (now < actor.endsAt) return null
  const action = nextAction(actor)
  actor.action = action
  actor.startedAt = now
  actor.endsAt = now + durationFor(action, actor.random)
  return action
}

export type ActorPose = {
  pose: SpritePose
  frame: number
  expression: SpriteExpression
  headDrop: number
  effect: OfficeEffect
  /** 키보드를 두드리는 중이면 화면 글자가 올라간다 */
  typing: boolean
}

const STATIC_POSE: ActorPose = { pose: 'type', frame: 0, expression: 'normal', headDrop: 0, effect: 'none', typing: false }

/** 동작 줄이기 설정일 때 쓰는 멈춘 자세 */
export function staticPose(): ActorPose {
  return STATIC_POSE
}

/** 지금 시각의 자세. 눈 깜빡임도 여기서 정한다. */
export function actorPose(actor: OfficeActor, now: number, view: SpriteView): ActorPose {
  const elapsed = Math.max(0, now - actor.startedAt)
  if (now >= actor.nextBlinkAt + 140) {
    actor.nextBlinkAt = now + 2200 + Math.round(actor.random() * 3200)
  }
  const blinking = now >= actor.nextBlinkAt && now < actor.nextBlinkAt + 140
  const typingFrame = Math.floor(elapsed / typingInterval(actor.personality)) % 2
  const lean = view === 'front' ? 1 : -1
  let result: ActorPose
  switch (actor.action) {
    case 'type':
      result = { pose: 'type', frame: typingFrame, expression: 'normal', headDrop: 0, effect: 'none', typing: true }
      break
    case 'mouse':
      result = { pose: 'mouse', frame: 0, expression: elapsed % 1600 < 800 ? 'normal' : 'glance', headDrop: 0, effect: 'none', typing: false }
      break
    case 'sip':
      result = elapsed < 500 || elapsed > DURATIONS.sip[0] - 400
        ? { pose: 'idle', frame: 0, expression: 'normal', headDrop: 0, effect: 'steam', typing: false }
        : { pose: 'sip', frame: 0, expression: 'blink', headDrop: 0, effect: 'steam', typing: false }
      break
    case 'think':
      result = { pose: 'think', frame: 0, expression: 'glance', headDrop: 0, effect: 'think', typing: false }
      break
    case 'idea':
      result = { pose: 'idle', frame: 0, expression: 'surprised', headDrop: 0, effect: 'idea', typing: false }
      break
    case 'stretch':
      result = { pose: 'stretch', frame: Math.floor(elapsed / 420) % 2, expression: 'happy', headDrop: 0, effect: 'none', typing: false }
      break
    case 'nod':
      result = {
        pose: 'type',
        frame: typingFrame,
        expression: 'happy',
        headDrop: Math.floor(elapsed / 300) % 2,
        effect: 'music',
        typing: true,
      }
      break
    case 'write':
      result = { pose: 'write', frame: Math.floor(elapsed / 260) % 2, expression: 'focus', headDrop: 0, effect: 'none', typing: false }
      break
    case 'phone':
      result = { pose: 'phone', frame: 0, expression: 'normal', headDrop: 0, effect: 'call', typing: false }
      break
    case 'peer':
      result = {
        pose: 'type',
        frame: Math.floor(elapsed / 520) % 2,
        expression: 'focus',
        headDrop: lean,
        effect: 'none',
        typing: true,
      }
      break
    case 'found':
      result = { pose: 'idle', frame: 0, expression: 'surprised', headDrop: 0, effect: 'found', typing: false }
      break
    case 'look':
    default:
      result = { pose: 'idle', frame: 0, expression: 'glance', headDrop: 0, effect: 'none', typing: false }
      break
  }
  if (blinking && (result.expression === 'normal' || result.expression === 'focus' || result.expression === 'glance')) {
    return { ...result, expression: 'blink' }
  }
  return result
}
