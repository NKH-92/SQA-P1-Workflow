import type { PersonalityId } from './officeCharacter'
import {
  AISLE_Y,
  BAR_Y,
  CORRIDOR_Y,
  LEFT_LANE_X,
  LOWER_Y,
  MEETING_DOOR_X,
  MEETING_RING,
  MEETING_SPOTS,
  RIGHT_LANE_X,
  SCENE_SEATS,
  seatStandSpot,
  TRIP_SPOTS,
  WORLD_TRIP_DESTINATIONS,
  type ScenePoint,
  type TripDestination,
  type TripSpot,
} from './officeScene'
import type { SpriteExpression } from './officeSprites'
import type { Facing, HeldItem, StandingPose } from './officeStandingSprites'

/**
 * 자리에서 일어나 사무실 안을 다녀오는 동작(커피 타러, 창밖 구경, 공지 보러 …).
 * 길은 복도·통로·양옆 세로 길·창가 바 앞길로 된 작은 그래프이고, 가로·세로로만 걷는다.
 * 전체 화면 사무실에서는 아래쪽 복도로 회의실·복합기·기록부·샘플 보관장·업무 분장표까지 간다.
 * 회의(인스턴트 회의)에 들어간 사람은 회의실 자리에 서 있다가 회의가 끝나면 돌아온다.
 */

/** 걷는 속도(논리 픽셀/ms). 초당 약 28px */
export const WALK_SPEED = 0.028
/** 한 걸음(걷기 장이 바뀌는 거리) */
const STEP_LENGTH = 5
const RISE_MS = 450
const SETTLE_MS = 350

/** 회의실 자리로 가는 다녀오기. 회의가 끝날 때까지 머문다. */
export type TripKind = TripDestination | 'room'

const STAY_MS: Record<TripDestination, number> = {
  kanban: 3400,
  notice: 3400,
  cabinet: 3000,
  coffee: 4200,
  window: 4800,
  water: 3400,
  printer: 3200,
  meeting: 5200,
  lounge: 5600,
  logbook: 3000,
  samples: 3600,
  duties: 3200,
}

/** 다녀오면서 손에 들고 오는 물건 */
const RETURN_HELD: Record<TripDestination, HeldItem> = {
  kanban: 'none',
  notice: 'none',
  cabinet: 'binder',
  coffee: 'cup',
  window: 'none',
  water: 'cup',
  printer: 'paper',
  meeting: 'none',
  lounge: 'none',
  logbook: 'none',
  samples: 'paper',
  duties: 'none',
}

/** 도착했을 때 말풍선으로 하는 말 */
export const TRIP_LINES: Record<TripKind, readonly string[]> = {
  kanban: ['검토요청 현황 확인!', '대기 중인 검토부터 볼게요'],
  notice: ['새 공지 확인했어요', 'GMP 교육 일정 체크!'],
  cabinet: ['SOP 개정본 찾았다', '변경관리 문서 확인 중…'],
  coffee: ['커피 한 잔 충전!', '카페인 없인 검토 못 해'],
  window: ['잠깐 창밖 구경', '눈 좀 쉬어 가요'],
  water: ['물 한 잔 마시고 올게요', '수분 보충 완료'],
  printer: ['시험성적서 출력 완료!', '배치 기록서 뽑아 왔어요'],
  meeting: ['프로젝트 일정 맞춰 봐요', '밸리데이션 계획 논의 중'],
  lounge: ['잠깐 숨 돌리는 중', '머리 좀 식히고 올게요'],
  logbook: ['출입 기록 남겼어요', '기록은 ALCOA+로!'],
  samples: ['안정성 샘플 확인 완료', '보관 온도 정상!'],
  duties: ['업무 분장 확인!', '이번 주 담당 체크'],
  room: ['회의 들어왔어요', '자, 시작해 볼까요?'],
}

const DESTINATION_WEIGHTS: Record<PersonalityId, Partial<Record<TripDestination, number>>> = {
  typist: { printer: 3, kanban: 2, notice: 1, coffee: 1, water: 1, logbook: 1, duties: 1 },
  coffee: { coffee: 6, window: 2, water: 1, notice: 1, lounge: 2 },
  thinker: { meeting: 3, kanban: 2, window: 3, notice: 1, coffee: 1, lounge: 1, duties: 1 },
  stretcher: { water: 3, window: 2, coffee: 1, notice: 1, meeting: 1, lounge: 3 },
  music: { notice: 2, coffee: 2, window: 2, water: 2, lounge: 2 },
  memo: { cabinet: 4, printer: 2, kanban: 1, logbook: 3, samples: 1 },
  caller: { meeting: 4, printer: 1, coffee: 1, window: 1, lounge: 1 },
  checker: { kanban: 3, cabinet: 2, printer: 2, samples: 3, logbook: 1 },
}

// ── 길 그래프 ────────────────────────────────────────────

type GraphNode = ScenePoint & { id: string }

type WalkGraph = {
  nodes: Map<string, GraphNode>
  edges: Map<string, Set<string>>
}

export function seatNodeId(seatIndex: number) {
  return `seat:${seatIndex}`
}

export function destinationNodeId(destination: TripDestination) {
  return `dest:${destination}`
}

export function meetingSpotNodeId(spotIndex: number) {
  return `room:${spotIndex}`
}

function buildGraph(): WalkGraph {
  const nodes = new Map<string, GraphNode>()
  const edges = new Map<string, Set<string>>()
  const corridor: string[] = []
  const aisle: string[] = []
  const lower: string[] = []
  const leftLane: string[] = []
  const rightLane: string[] = []
  const add = (id: string, x: number, y: number) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, x, y })
      edges.set(id, new Set())
    }
    return id
  }
  const link = (a: string, b: string) => {
    edges.get(a)!.add(b)
    edges.get(b)!.add(a)
  }
  const onCorridor = (x: number) => {
    const id = add(`corridor:${x}`, x, CORRIDOR_Y)
    if (!corridor.includes(id)) corridor.push(id)
    return id
  }
  const onAisle = (x: number) => {
    const id = add(`aisle:${x}`, x, AISLE_Y)
    if (!aisle.includes(id)) aisle.push(id)
    return id
  }
  const onLower = (x: number) => {
    const id = add(`lower:${x}`, x, LOWER_Y)
    if (!lower.includes(id)) lower.push(id)
    return id
  }
  const onLeftLane = (y: number) => {
    const id = y === CORRIDOR_Y ? onCorridor(LEFT_LANE_X) : y === AISLE_Y ? onAisle(LEFT_LANE_X) : add(`left:${y}`, LEFT_LANE_X, y)
    if (!leftLane.includes(id)) leftLane.push(id)
    return id
  }
  const onRightLane = (y: number) => {
    const id = y === CORRIDOR_Y ? onCorridor(RIGHT_LANE_X) : y === AISLE_Y ? onAisle(RIGHT_LANE_X) : add(`right:${y}`, RIGHT_LANE_X, y)
    if (!rightLane.includes(id)) rightLane.push(id)
    return id
  }

  onLeftLane(CORRIDOR_Y)
  onLeftLane(AISLE_Y)
  onRightLane(CORRIDOR_Y)
  onRightLane(AISLE_Y)

  for (const seat of SCENE_SEATS) {
    const stand = seatStandSpot(seat)
    const id = add(seatNodeId(seat.seatIndex), stand.x, stand.y)
    link(id, seat.row === 'window' ? onCorridor(seat.x) : onAisle(seat.x))
  }

  const kanban = TRIP_SPOTS.kanban
  add(destinationNodeId('kanban'), kanban.x, kanban.y)
  corridor.push(destinationNodeId('kanban'))
  const notice = TRIP_SPOTS.notice
  add(destinationNodeId('notice'), notice.x, notice.y)
  corridor.push(destinationNodeId('notice'))

  const cabinet = TRIP_SPOTS.cabinet
  link(add(destinationNodeId('cabinet'), cabinet.x, cabinet.y), onLeftLane(cabinet.y))

  // 창가 바: 오른쪽 세로 길에서 통창 앞길을 따라 커피 머신 → 창밖 구경 자리 → 정수기
  const bar: string[] = [onRightLane(BAR_Y)]
  for (const destination of ['coffee', 'window', 'water'] as const) {
    const spot = TRIP_SPOTS[destination]
    bar.push(add(destinationNodeId(destination), spot.x, spot.y))
  }

  // 창가 라운지(소파 옆)는 통로 끝에 있다.
  const lounge = TRIP_SPOTS.lounge
  add(destinationNodeId('lounge'), lounge.x, lounge.y)
  aisle.push(destinationNodeId('lounge'))

  const meeting = TRIP_SPOTS.meeting
  link(add(destinationNodeId('meeting'), meeting.x, meeting.y), onAisle(meeting.x))

  // ── 전체 화면 사무실: 양옆 세로 길이 아래쪽 복도까지 내려간다.
  leftLane.push(onLower(LEFT_LANE_X))
  rightLane.push(onLower(RIGHT_LANE_X))

  // 복합기 코너는 용지 상자 오른쪽으로 내려가 앞에 선다.
  const printer = TRIP_SPOTS.printer
  const printerWalk = add('printer-walk', 146, printer.y)
  link(printerWalk, onLower(146))
  link(printerWalk, add(destinationNodeId('printer'), printer.x, printer.y))
  const logbook = TRIP_SPOTS.logbook
  link(add(destinationNodeId('logbook'), logbook.x, logbook.y), onLower(logbook.x))
  // 샘플 보관장은 옆 통로로 내려가 앞에 선다. 업무 분장표는 그 앞길을 따라 오른쪽에 있다.
  const samples = TRIP_SPOTS.samples
  const samplesWalk = add('samples-walk', 334, samples.y)
  link(samplesWalk, onLower(334))
  link(samplesWalk, add(destinationNodeId('samples'), samples.x, samples.y))
  const duties = TRIP_SPOTS.duties
  link(destinationNodeId('samples'), add(destinationNodeId('duties'), duties.x, duties.y))

  // 회의실: 문에서 테이블 둘레 길로 들어가 자리에 선다.
  const ringNode = (x: number, y: number) => add(`ring:${x}:${y}`, x, y)
  const ringTop = [MEETING_RING.left, -6, 12, MEETING_DOOR_X, MEETING_RING.right].map((x) => ringNode(x, MEETING_RING.top))
  const bottomLeft = ringNode(MEETING_RING.left, MEETING_RING.bottom)
  const bottomRight = ringNode(MEETING_RING.right, MEETING_RING.bottom)
  const ringBottom = [bottomLeft, bottomRight]
  const ringLeft = [ringTop[0], bottomLeft]
  const ringRight = [ringTop[ringTop.length - 1], bottomRight]
  MEETING_SPOTS.forEach((spot, index) => {
    const id = add(meetingSpotNodeId(index), spot.x, spot.y)
    if (spot.y === MEETING_RING.bottom) ringBottom.push(id)
    else if (spot.x === MEETING_RING.left) ringLeft.push(id)
    else if (spot.x === MEETING_RING.right) ringRight.push(id)
    else link(id, ringNode(spot.x, MEETING_RING.top))
  })
  link(onLower(MEETING_DOOR_X), ringNode(MEETING_DOOR_X, MEETING_RING.top))

  const chain = (ids: string[], key: 'x' | 'y') => {
    const sorted = [...new Set(ids)].sort((left, right) => nodes.get(left)![key] - nodes.get(right)![key])
    for (let index = 1; index < sorted.length; index += 1) link(sorted[index - 1], sorted[index])
  }
  chain(corridor, 'x')
  chain(aisle, 'x')
  chain(bar, 'x')
  chain(lower, 'x')
  chain(leftLane, 'y')
  chain(rightLane, 'y')
  chain(ringTop, 'x')
  chain(ringBottom, 'x')
  chain(ringLeft, 'y')
  chain(ringRight, 'y')
  return { nodes, edges }
}

const GRAPH = buildGraph()

/** 그래프 위 최단 경로(맨해튼 거리). 두 점 사이는 늘 가로 또는 세로 한 줄이다. */
export function findWalkPath(from: string, to: string): ScenePoint[] {
  const distance = new Map<string, number>([[from, 0]])
  const previous = new Map<string, string>()
  const queue = new Set<string>(GRAPH.nodes.keys())
  while (queue.size > 0) {
    let current: string | null = null
    for (const id of queue) {
      if (current === null || (distance.get(id) ?? Infinity) < (distance.get(current) ?? Infinity)) current = id
    }
    if (current === null || !Number.isFinite(distance.get(current) ?? Infinity)) break
    queue.delete(current)
    if (current === to) break
    const here = GRAPH.nodes.get(current)!
    for (const next of GRAPH.edges.get(current) ?? []) {
      if (!queue.has(next)) continue
      const there = GRAPH.nodes.get(next)!
      const candidate = (distance.get(current) ?? 0) + Math.abs(here.x - there.x) + Math.abs(here.y - there.y)
      if (candidate < (distance.get(next) ?? Infinity)) {
        distance.set(next, candidate)
        previous.set(next, current)
      }
    }
  }
  if (!distance.has(to)) return []
  const ids = [to]
  while (ids[0] !== from) ids.unshift(previous.get(ids[0])!)
  return ids.map((id) => {
    const node = GRAPH.nodes.get(id)!
    return { x: node.x, y: node.y }
  })
}

/** 테스트용: 그래프의 모든 선분 */
export function walkGraphEdgesForTest(): Array<[ScenePoint, ScenePoint]> {
  const pairs: Array<[ScenePoint, ScenePoint]> = []
  for (const [id, links] of GRAPH.edges) {
    for (const other of links) if (id < other) pairs.push([GRAPH.nodes.get(id)!, GRAPH.nodes.get(other)!])
  }
  return pairs
}

// ── 다녀오기 ─────────────────────────────────────────────

export type TripPhase = 'rise' | 'out' | 'stay' | 'back' | 'settle'

export type Trip = {
  seatIndex: number
  destination: TripKind
  /** 도착해서 서는 곳과 바라보는 방향 */
  target: TripSpot
  /** 이번 길을 떠난 그래프 지점(보통 자기 자리, 다른 곳에 들렀다 회의실로 가면 그곳) */
  originNode: string
  /** 자리로 돌아오는 길. 없으면 온 길을 거꾸로 걷는다. */
  returnPath: ScenePoint[] | null
  phase: TripPhase
  phaseStartedAt: number
  phaseEndsAt: number
  path: ScenePoint[]
  pathIndex: number
  position: ScenePoint
  facing: Facing
  held: HeldItem
  walked: number
  updatedAt: number
}

export type TripEvent = 'arrived' | 'returned' | null

function facingToward(from: ScenePoint, to: ScenePoint, fallback: Facing): Facing {
  if (to.x < from.x) return 'left'
  if (to.x > from.x) return 'right'
  if (to.y < from.y) return 'up'
  if (to.y > from.y) return 'down'
  return fallback
}

function startTrip(seatIndex: number, destination: TripKind, target: TripSpot, targetNode: string, now: number): Trip | null {
  const seat = SCENE_SEATS.find((item) => item.seatIndex === seatIndex)
  if (!seat) return null
  const path = findWalkPath(seatNodeId(seatIndex), targetNode)
  if (path.length < 2) return null
  const stand = seatStandSpot(seat)
  return {
    seatIndex,
    destination,
    target,
    originNode: seatNodeId(seatIndex),
    returnPath: null,
    phase: 'rise',
    phaseStartedAt: now,
    phaseEndsAt: now + RISE_MS,
    path,
    pathIndex: 1,
    position: { x: stand.x, y: stand.y },
    facing: stand.facing,
    held: 'none',
    walked: 0,
    updatedAt: now,
  }
}

export function planTrip(seatIndex: number, destination: TripDestination, now: number): Trip | null {
  return startTrip(seatIndex, destination, TRIP_SPOTS[destination], destinationNodeId(destination), now)
}

/** 회의실 자리(MEETING_SPOTS 번호)로 간다. 회의가 끝나 releaseTrip을 부를 때까지 머문다. */
export function planMeetingTrip(seatIndex: number, spotIndex: number, now: number): Trip | null {
  const spot = MEETING_SPOTS[spotIndex]
  if (!spot) return null
  return startTrip(seatIndex, 'room', spot, meetingSpotNodeId(spotIndex), now)
}

/**
 * 회의가 끝났거나 빠졌을 때 자리로 돌려보낸다.
 * 일어나는 중이면 도로 앉고, 가는 중이면 그 자리에서 되돌아 걷는다.
 */
export function releaseTrip(trip: Trip, now: number) {
  // 이미 돌아오는 중이면 그대로 둔다(시각을 건드리면 걸음이 멈춘다).
  if (trip.phase === 'back' || trip.phase === 'settle') return
  trip.updatedAt = now
  if (trip.phase === 'rise') {
    trip.phase = 'settle'
    trip.phaseStartedAt = now
    trip.phaseEndsAt = now + SETTLE_MS
    return
  }
  if (trip.phase === 'out') {
    // 온 길을 되짚어 떠난 곳까지 간 뒤, 거기가 자리가 아니면 자리까지 이어 걷는다.
    const seatNode = seatNodeId(trip.seatIndex)
    const rest = trip.originNode === seatNode ? [] : findWalkPath(trip.originNode, seatNode).slice(1)
    trip.path = [{ ...trip.position }, ...trip.path.slice(0, trip.pathIndex).reverse(), ...rest]
    trip.pathIndex = 1
    trip.phase = 'back'
    trip.phaseStartedAt = now
    return
  }
  if (trip.phase === 'stay') {
    trip.phase = 'back'
    trip.phaseStartedAt = now
    trip.path = trip.returnPath ?? [...trip.path].reverse()
    trip.pathIndex = 1
  }
}

/**
 * 다른 곳에 들렀다가 도착해 있는 사람을 그 자리에서 바로 회의실로 보낸다(자리에 먼저 들르지 않는다).
 * 도착해 있지 않으면(가는 중·돌아오는 중) false를 돌려주고, 도착하거나 자리에 앉은 뒤에 다시 부른다.
 */
export function redirectToMeeting(trip: Trip, spotIndex: number, now: number): boolean {
  if (trip.phase !== 'stay' || trip.destination === 'room') return false
  const spot = MEETING_SPOTS[spotIndex]
  if (!spot) return false
  const origin = destinationNodeId(trip.destination)
  const path = findWalkPath(origin, meetingSpotNodeId(spotIndex))
  const home = findWalkPath(meetingSpotNodeId(spotIndex), seatNodeId(trip.seatIndex))
  if (path.length < 2 || home.length < 2) return false
  trip.destination = 'room'
  trip.target = spot
  trip.originNode = origin
  trip.returnPath = home
  trip.phase = 'out'
  trip.phaseStartedAt = now
  trip.path = path
  trip.pathIndex = 1
  trip.updatedAt = now
  return true
}

/** 경로를 따라 걷는다. 끝에 닿으면 true */
function walk(trip: Trip, elapsed: number): boolean {
  let budget = elapsed * WALK_SPEED
  while (budget > 0 && trip.pathIndex < trip.path.length) {
    const target = trip.path[trip.pathIndex]
    const dx = target.x - trip.position.x
    const dy = target.y - trip.position.y
    const remaining = Math.abs(dx) + Math.abs(dy)
    if (remaining === 0) {
      trip.pathIndex += 1
      continue
    }
    trip.facing = facingToward(trip.position, target, trip.facing)
    const step = Math.min(budget, remaining)
    trip.position = {
      x: trip.position.x + Math.sign(dx) * Math.min(step, Math.abs(dx)),
      y: trip.position.y + Math.sign(dy) * Math.min(step, Math.abs(dy)),
    }
    trip.walked += step
    budget -= step
    if (step >= remaining) trip.pathIndex += 1
  }
  return trip.pathIndex >= trip.path.length
}

/** 시간을 흘려 다녀오기를 진행한다. 도착·복귀한 순간 이벤트를 돌려준다. */
export function advanceTrip(trip: Trip, now: number): TripEvent {
  const elapsed = Math.max(0, now - trip.updatedAt)
  trip.updatedAt = now
  switch (trip.phase) {
    case 'rise':
      if (now < trip.phaseEndsAt) return null
      trip.phase = 'out'
      trip.phaseStartedAt = now
      return null
    case 'out':
      if (!walk(trip, elapsed)) return null
      trip.phase = 'stay'
      trip.phaseStartedAt = now
      trip.phaseEndsAt = trip.destination === 'room' ? Infinity : now + STAY_MS[trip.destination]
      trip.facing = trip.target.facing
      return 'arrived'
    case 'stay':
      if (now < trip.phaseEndsAt) return null
      trip.phase = 'back'
      trip.phaseStartedAt = now
      trip.held = trip.destination === 'room' ? 'none' : RETURN_HELD[trip.destination]
      trip.path = trip.returnPath ?? [...trip.path].reverse()
      trip.pathIndex = 1
      return null
    case 'back':
      if (!walk(trip, elapsed)) return null
      trip.phase = 'settle'
      trip.phaseStartedAt = now
      trip.phaseEndsAt = now + SETTLE_MS
      trip.facing = seatStandSpot(SCENE_SEATS[trip.seatIndex - 1]).facing === 'down' ? 'down' : 'up'
      return null
    case 'settle':
      return now >= trip.phaseEndsAt ? 'returned' : null
    default:
      return null
  }
}

export type TripPose = {
  facing: Facing
  pose: StandingPose
  frame: number
  held: HeldItem
  expression: SpriteExpression
}

/** 지금 시각의 서 있는 자세(목적지마다 하는 일이 다르다). */
export function tripPose(trip: Trip, now: number): TripPose {
  const blink = now % 3700 < 130
  const expression: SpriteExpression = blink ? 'blink' : 'normal'
  if (trip.phase === 'out' || trip.phase === 'back') {
    return { facing: trip.facing, pose: 'walk', frame: Math.floor(trip.walked / STEP_LENGTH) % 4, held: trip.held, expression }
  }
  if (trip.phase !== 'stay') return { facing: trip.facing, pose: 'stand', frame: 0, held: trip.held, expression }
  const elapsed = now - trip.phaseStartedAt
  const facing = trip.target.facing
  switch (trip.destination) {
    case 'kanban':
    case 'notice':
      return { facing: 'up', pose: elapsed < 1400 ? 'reach' : 'stand', frame: 0, held: 'none', expression }
    case 'cabinet':
      return { facing: 'up', pose: elapsed < 1600 ? 'reach' : 'stand', frame: 0, held: 'none', expression }
    case 'window':
      // 창밖을 바라보다가 가끔 기지개를 켠다.
      return { facing: 'up', pose: elapsed % 3000 < 2200 ? 'stand' : 'reach', frame: 0, held: 'none', expression }
    case 'coffee':
    case 'water': {
      const brewing = trip.destination === 'coffee' ? 1800 : 1200
      if (elapsed < brewing) return { facing: 'up', pose: 'stand', frame: 0, held: 'none', expression }
      if (elapsed < brewing + 500) return { facing: 'down', pose: 'stand', frame: 0, held: 'cup', expression: 'normal' }
      return { facing: 'down', pose: 'sip', frame: 0, held: 'cup', expression: 'blink' }
    }
    case 'printer':
      return { facing: 'right', pose: elapsed < 2200 ? 'reach' : 'stand', frame: 0, held: elapsed < 2200 ? 'none' : 'paper', expression }
    case 'meeting':
      return { facing: 'left', pose: 'talk', frame: Math.floor(elapsed / 300) % 2, held: 'none', expression }
    case 'lounge':
      return { facing, pose: elapsed % 2600 < 1600 ? 'talk' : 'stand', frame: Math.floor(elapsed / 350) % 2, held: 'none', expression }
    case 'logbook':
      return { facing, pose: elapsed < 2000 ? 'reach' : 'stand', frame: 0, held: 'none', expression }
    case 'samples':
      return { facing, pose: elapsed < 2200 ? 'reach' : 'stand', frame: 0, held: elapsed < 2200 ? 'none' : 'paper', expression }
    case 'duties':
      return { facing, pose: elapsed < 1500 ? 'reach' : 'stand', frame: 0, held: 'none', expression }
    case 'room':
      // 회의 중: 번갈아 말하고 듣는다.
      return { facing, pose: elapsed % 4200 < 2400 ? 'talk' : 'stand', frame: Math.floor(elapsed / 320) % 2, held: 'none', expression }
    default:
      return { facing: trip.facing, pose: 'stand', frame: 0, held: 'none', expression }
  }
}

/** 복합기에 출력물이 나오는 정도(0~1). 복합기 앞에 선 사람이 없으면 0 */
export function printerProgress(trips: readonly Trip[], now: number): number {
  const printing = trips.find((trip) => trip.destination === 'printer' && trip.phase === 'stay')
  if (!printing) return 0
  return Math.min(1, (now - printing.phaseStartedAt) / 2200)
}

/**
 * 개성과 지금 비어 있는 목적지를 보고 갈 곳을 고른다.
 * 전체 화면이 아니면(world=false) 화면 밖이 되는 아래쪽 목적지는 고르지 않는다.
 */
export function chooseDestination(
  personality: PersonalityId,
  busy: ReadonlySet<TripDestination>,
  random: () => number,
  world = false,
): TripDestination | null {
  const worldOnly = new Set<TripDestination>(WORLD_TRIP_DESTINATIONS)
  const entries = (Object.entries(DESTINATION_WEIGHTS[personality]) as Array<[TripDestination, number]>)
    .filter(([destination]) => !busy.has(destination) && (world || !worldOnly.has(destination)))
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  if (total <= 0) return null
  let roll = random() * total
  for (const [destination, weight] of entries) {
    roll -= weight
    if (roll < 0) return destination
  }
  return entries[entries.length - 1][0]
}
