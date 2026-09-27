import { describe, expect, it } from 'vitest'
import { MEETING_SPOTS, SCENE_SEATS, seatStandSpot, TRIP_SPOTS, type TripDestination } from './officeScene'
import {
  advanceTrip,
  chooseDestination,
  destinationNodeId,
  findWalkPath,
  meetingSpotNodeId,
  planMeetingTrip,
  planTrip,
  printerProgress,
  redirectToMeeting,
  releaseTrip,
  seatNodeId,
  tripPose,
  walkGraphEdgesForTest,
  type Trip,
  type TripEvent,
} from './officeWalk'

const DESTINATIONS = Object.keys(TRIP_SPOTS) as TripDestination[]

function run(seatIndex: number, destination: TripDestination) {
  const trip = planTrip(seatIndex, destination, 0)
  if (!trip) throw new Error('no trip')
  const events: TripEvent[] = []
  const positions = [{ ...trip.position }]
  for (let now = 100; now < 120_000; now += 100) {
    const event = advanceTrip(trip, now)
    positions.push({ ...trip.position })
    if (event) events.push(event)
    if (event === 'returned') break
  }
  return { trip, events, positions }
}

describe('office walking paths', () => {
  it('only uses horizontal or vertical path segments', () => {
    for (const [from, to] of walkGraphEdgesForTest()) {
      expect(from.x === to.x || from.y === to.y).toBe(true)
    }
  })

  it('connects every seat to every destination', () => {
    for (const seat of SCENE_SEATS) {
      for (const destination of DESTINATIONS) {
        const path = findWalkPath(seatNodeId(seat.seatIndex), destinationNodeId(destination))
        expect(path.length, `${seat.seatIndex} → ${destination}`).toBeGreaterThan(1)
        expect(path[0]).toEqual({ x: seatStandSpot(seat).x, y: seatStandSpot(seat).y })
        expect(path[path.length - 1]).toEqual({ x: TRIP_SPOTS[destination].x, y: TRIP_SPOTS[destination].y })
        for (let index = 1; index < path.length; index += 1) {
          expect(path[index].x === path[index - 1].x || path[index].y === path[index - 1].y).toBe(true)
        }
      }
    }
  })

  it('stands up, walks there, stays, walks back and sits down again', () => {
    for (const destination of DESTINATIONS) {
      const { trip, events, positions } = run(2, destination)
      expect(events).toEqual(['arrived', 'returned'])
      const stand = seatStandSpot(SCENE_SEATS[1])
      expect(trip.position).toEqual({ x: stand.x, y: stand.y })
      expect(positions.some((position) => position.x === TRIP_SPOTS[destination].x && position.y === TRIP_SPOTS[destination].y)).toBe(true)
      // 한 장에 너무 멀리 뛰지 않는다(초당 약 28px, 0.1초마다 3px 이하).
      for (let index = 1; index < positions.length; index += 1) {
        const step = Math.abs(positions[index].x - positions[index - 1].x) + Math.abs(positions[index].y - positions[index - 1].y)
        expect(step).toBeLessThanOrEqual(3)
      }
    }
  })

  it('brings back what the trip was for', () => {
    const printer = planTrip(6, 'printer', 0)!
    const coffee = planTrip(1, 'coffee', 0)!
    const kanban = planTrip(5, 'kanban', 0)!
    for (let now = 100; now < 120_000; now += 100) {
      for (const trip of [printer, coffee, kanban]) if (trip.phase !== 'settle') advanceTrip(trip, now)
      if ([printer, coffee, kanban].every((trip) => trip.phase === 'back' || trip.phase === 'settle')) break
    }
    expect(printer.held).toBe('paper')
    expect(coffee.held).toBe('cup')
    expect(kanban.held).toBe('none')
  })

  it('animates walking frames and destination activities', () => {
    const trip = planTrip(3, 'printer', 0)!
    const frames = new Set<number>()
    let now = 0
    while (trip.phase !== 'stay') {
      now += 100
      advanceTrip(trip, now)
      const pose = tripPose(trip, now)
      if (pose.pose === 'walk') frames.add(pose.frame)
    }
    expect([...frames].sort()).toEqual([0, 1, 2, 3])
    expect(tripPose(trip, now + 100)).toMatchObject({ facing: 'right', pose: 'reach' })
    expect(printerProgress([trip], now + 1100)).toBeGreaterThan(0)
    expect(printerProgress([], now)).toBe(0)
  })

  it('picks a destination that fits the personality and skips busy ones', () => {
    const always = () => 0
    expect(chooseDestination('coffee', new Set(), always)).toBe('coffee')
    expect(chooseDestination('coffee', new Set(['coffee']), always)).not.toBe('coffee')
    expect(chooseDestination('memo', new Set(['cabinet', 'printer', 'kanban']), always)).toBeNull()
  })

  it('only visits the lower floor in the full-screen office', () => {
    const always = () => 0
    const busyTop = new Set<TripDestination>(['cabinet', 'printer', 'kanban'])
    expect(chooseDestination('memo', busyTop, always, true)).toBe('logbook')
    for (let roll = 0; roll < 1; roll += 0.05) {
      expect(['lounge', 'logbook', 'samples', 'duties']).not.toContain(chooseDestination('checker', new Set(), () => roll))
    }
  })
})

describe('office meeting trips', () => {
  function runUntil(trip: Trip, stop: (trip: Trip) => boolean, from = 0) {
    let now = from
    while (!stop(trip) && now < from + 120_000) {
      now += 100
      advanceTrip(trip, now)
    }
    return now
  }

  it('connects every seat to every meeting room spot on horizontal and vertical paths', () => {
    for (const seat of SCENE_SEATS) {
      MEETING_SPOTS.forEach((spot, index) => {
        const path = findWalkPath(seatNodeId(seat.seatIndex), meetingSpotNodeId(index))
        expect(path[path.length - 1]).toEqual({ x: spot.x, y: spot.y })
        for (let step = 1; step < path.length; step += 1) {
          expect(path[step].x === path[step - 1].x || path[step].y === path[step - 1].y).toBe(true)
        }
      })
    }
  })

  it('stays in the room until the meeting ends, then walks back to the desk', () => {
    const trip = planMeetingTrip(6, 2, 0)!
    let now = runUntil(trip, (current) => current.phase === 'stay')
    expect(trip.position).toEqual({ x: MEETING_SPOTS[2].x, y: MEETING_SPOTS[2].y })
    now = runUntil(trip, () => false, now)
    expect(trip.phase).toBe('stay')
    releaseTrip(trip, now)
    let event: TripEvent = null
    while (event !== 'returned' && now < 400_000) {
      now += 100
      event = advanceTrip(trip, now)
    }
    expect(event).toBe('returned')
    const stand = seatStandSpot(SCENE_SEATS[5])
    expect(trip.position).toEqual({ x: stand.x, y: stand.y })
  })

  it('turns around halfway when the meeting ends on the way there', () => {
    const trip = planMeetingTrip(1, 0, 0)!
    const now = runUntil(trip, (current) => current.phase === 'out' && current.walked > 60)
    releaseTrip(trip, now)
    expect(trip.phase).toBe('back')
    runUntil(trip, (current) => current.phase === 'settle', now)
    const stand = seatStandSpot(SCENE_SEATS[0])
    expect(trip.position).toEqual({ x: stand.x, y: stand.y })
  })

  it('goes straight from an errand to the meeting room and home from there', () => {
    const trip = planTrip(8, 'lounge', 0)!
    let now = runUntil(trip, (current) => current.phase === 'stay')
    expect(redirectToMeeting(trip, 1, now)).toBe(true)
    now = runUntil(trip, (current) => current.phase === 'stay', now)
    expect(trip.position).toEqual({ x: MEETING_SPOTS[1].x, y: MEETING_SPOTS[1].y })
    releaseTrip(trip, now)
    runUntil(trip, (current) => current.phase === 'settle', now)
    const stand = seatStandSpot(SCENE_SEATS[7])
    expect(trip.position).toEqual({ x: stand.x, y: stand.y })
    expect(destinationNodeId('lounge')).toBe('dest:lounge')
  })
})
