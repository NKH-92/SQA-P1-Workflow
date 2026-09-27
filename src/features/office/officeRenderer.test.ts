import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveOfficeCharacter } from './officeCharacter'
import { CORE_CAMERA, WORLD_CAMERA } from './officeGeometry'
import { createOfficeRenderer, type OfficeRenderer } from './officeRenderer'
import { MEETING_SPOTS, SCENE_SEATS, seatStandSpot } from './officeScene'

/** 그리기 결과는 보지 않고 사람 위치(anchors)만 확인하려고, 아무것도 하지 않는 2D 컨텍스트를 넣는다. */
function fakeContext(): CanvasRenderingContext2D {
  const noop = () => undefined
  return new Proxy({} as Record<string, unknown>, {
    get: (target, key) => (key in target ? target[key as string] : noop),
    set: (target, key, value) => {
      target[key as string] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

const clock = { hour: 10, minute: 0 }

function run(renderer: OfficeRenderer, from: number, to: number) {
  for (let now = from; now <= to; now += 100) renderer.draw(now, { animate: true, clock })
}

function anchorOf(renderer: OfficeRenderer, seatIndex: number) {
  return renderer.anchors().find((anchor) => anchor.seatIndex === seatIndex)!
}

describe('office renderer meeting room', () => {
  let original: PropertyDescriptor | undefined

  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, writable: true, value: fakeContext })
    // 누군가 제멋대로 다녀오지 않게 무작위 값을 크게 둔다(다녀오기·말풍선 간격이 길어진다).
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (original) Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', original)
  })

  function officeWith(seats: number[]) {
    const renderer = createOfficeRenderer(document.createElement('canvas'))!
    renderer.setOccupants(seats.map((seatIndex) => ({ seatIndex, character: resolveOfficeCharacter('female', seatIndex * 7) })))
    renderer.setCamera(WORLD_CAMERA)
    return renderer
  }

  it('walks attendees to their own spots in the room and back to their desks when the meeting ends', () => {
    const renderer = officeWith([2, 3])
    renderer.setMeeting([3])
    run(renderer, 0, 30_000)
    const first = anchorOf(renderer, 3)
    expect(first.standing).toBe(true)
    expect(first.x).toBe(MEETING_SPOTS[0].x)

    // 나중에 들어온 사람은 빈 자리로 가고, 먼저 온 사람은 자리를 옮기지 않는다.
    renderer.setMeeting([2, 3])
    run(renderer, 30_100, 60_000)
    expect(anchorOf(renderer, 3).x).toBe(MEETING_SPOTS[0].x)
    expect(anchorOf(renderer, 2).x).toBe(MEETING_SPOTS[1].x)

    renderer.setMeeting([])
    const backAtDesk = new Set<number>()
    for (let now = 60_100; now <= 100_000 && backAtDesk.size < 2; now += 100) {
      renderer.draw(now, { animate: true, clock })
      for (const seatIndex of [2, 3]) {
        const anchor = anchorOf(renderer, seatIndex)
        if (!anchor.standing && anchor.x === SCENE_SEATS[seatIndex - 1].x) backAtDesk.add(seatIndex)
      }
    }
    expect([...backAtDesk].sort()).toEqual([2, 3])
  })

  it('sends someone who is out on another errand straight from there to the meeting room', () => {
    const renderer = officeWith([4])
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    // 누군가 다녀오기를 시작할 때까지 돌린 뒤, 도착한 순간 회의가 시작된다.
    let now = 0
    for (; now <= 60_000 && !anchorOf(renderer, 4).standing; now += 100) renderer.draw(now, { animate: true, clock })
    for (let settled = 0; settled < 40; settled += 1, now += 100) renderer.draw(now, { animate: true, clock })
    renderer.setMeeting([4])
    let reachedRoom = false
    let sawDesk = false
    for (let limit = now + 60_000; now <= limit && !reachedRoom; now += 100) {
      renderer.draw(now, { animate: true, clock })
      const anchor = anchorOf(renderer, 4)
      if (!anchor.standing) sawDesk = true
      reachedRoom = anchor.x === MEETING_SPOTS[0].x && anchor.bottom === MEETING_SPOTS[0].y
    }
    expect(reachedRoom).toBe(true)
    expect(sawDesk).toBe(false)
  })

  it('shows attendees already in the room without walking when motion is reduced', () => {
    const renderer = officeWith([5])
    renderer.setMeeting([5])
    renderer.draw(0, { animate: false, clock })
    expect(anchorOf(renderer, 5)).toMatchObject({ standing: true, x: MEETING_SPOTS[0].x })
    renderer.setMeeting([])
    renderer.draw(100, { animate: false, clock })
    expect(anchorOf(renderer, 5)).toMatchObject({ standing: false, x: SCENE_SEATS[4].x })
  })

  it('does not wander to the lower floor in the classic card, where it would be off screen', () => {
    const renderer = officeWith([1, 2, 3, 4, 5, 6])
    renderer.setCamera(CORE_CAMERA)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const lowest = { y: 0 }
    for (let now = 0; now <= 240_000; now += 100) {
      renderer.draw(now, { animate: true, clock })
      for (const anchor of renderer.anchors()) lowest.y = Math.max(lowest.y, anchor.bottom)
    }
    expect(lowest.y).toBeLessThanOrEqual(seatStandSpot(SCENE_SEATS[4]).y + 8)
  })

  it('leaves an empty chair with a status sign for people who are away, and never sends them walking', () => {
    const renderer = officeWith([2, 6])
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    renderer.setAbsences([{ seatIndex: 6, kind: 'trip' }])
    let wandered = false
    for (let now = 0; now <= 120_000; now += 100) {
      renderer.draw(now, { animate: true, clock })
      if (anchorOf(renderer, 6).standing) wandered = true
    }
    expect(wandered).toBe(false)
    // 이름표는 빈 의자 위 상태 표지에 붙는다.
    expect(anchorOf(renderer, 6)).toMatchObject({ standing: false, x: SCENE_SEATS[5].x })
    expect(renderer.skyPeriod()).toBe('낮')
  })

  it('stops an errand when someone steps away mid-walk', () => {
    const renderer = officeWith([3])
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    let now = 0
    for (; now <= 60_000 && !anchorOf(renderer, 3).standing; now += 100) renderer.draw(now, { animate: true, clock })
    expect(anchorOf(renderer, 3).standing).toBe(true)
    renderer.setAbsences([{ seatIndex: 3, kind: 'lab' }])
    renderer.draw(now + 100, { animate: true, clock })
    expect(anchorOf(renderer, 3)).toMatchObject({ standing: false, x: SCENE_SEATS[2].x })
  })
})
