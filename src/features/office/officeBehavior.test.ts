import { describe, expect, it } from 'vitest'
import { OFFICE_PERSONALITIES } from './officeCharacter'
import { actorPose, advanceActor, createActor, nextAction, staticPose, type OfficeAction } from './officeBehavior'

describe('office actor behaviour', () => {
  it('keeps the current action until it ends, then picks the next one', () => {
    const actor = createActor('typist', 42, 10_000)
    expect(actor.action).toBe('type')
    expect(advanceActor(actor, actor.endsAt - 1)).toBeNull()
    const started = advanceActor(actor, actor.endsAt)
    expect(started).not.toBeNull()
    expect(actor.action).toBe(started)
    expect(actor.endsAt).toBeGreaterThan(actor.startedAt)
  })

  it('mostly works at the keyboard and shows each personality its own habits', () => {
    for (const personality of OFFICE_PERSONALITIES) {
      const actor = createActor(personality.id, 7, 0)
      const counts = new Map<OfficeAction, number>()
      for (let step = 0; step < 600; step += 1) {
        const action = advanceActor(actor, actor.endsAt)!
        counts.set(action, (counts.get(action) ?? 0) + 1)
      }
      const typing = counts.get('type') ?? 0
      expect(typing / 600, personality.id).toBeGreaterThan(0.45)
      const signature = {
        typist: 'peer',
        coffee: 'sip',
        thinker: 'think',
        stretcher: 'stretch',
        music: 'nod',
        memo: 'write',
        caller: 'phone',
        checker: 'peer',
      }[personality.id] as OfficeAction
      expect(counts.get(signature) ?? 0, personality.id).toBeGreaterThan(0)
    }
  })

  it('follows thinking with ideas and peering with findings only from those actions', () => {
    const thinker = createActor('thinker', 3, 0)
    const checker = createActor('checker', 3, 0)
    let sawIdea = false
    let sawFound = false
    for (let step = 0; step < 400; step += 1) {
      const thinkerPrevious = thinker.action
      const idea = advanceActor(thinker, thinker.endsAt)
      if (idea === 'idea') {
        expect(thinkerPrevious).toBe('think')
        sawIdea = true
      }
      const checkerPrevious = checker.action
      const found = advanceActor(checker, checker.endsAt)
      if (found === 'found') {
        expect(checkerPrevious).toBe('peer')
        sawFound = true
      }
    }
    expect(sawIdea).toBe(true)
    expect(sawFound).toBe(true)
  })

  it('never repeats a special action back to back', () => {
    const actor = createActor('coffee', 11, 0)
    for (let step = 0; step < 300; step += 1) {
      const previous = actor.action
      const next = nextAction(actor)
      if (previous !== 'type') expect(next).not.toBe(previous)
      actor.action = next
    }
  })

  it('alternates typing frames over time and blinks briefly', () => {
    const actor = createActor('memo', 5, 0)
    actor.action = 'type'
    actor.startedAt = 0
    actor.endsAt = 100_000
    actor.nextBlinkAt = 50_000
    const frames = new Set([0, 170, 340, 510].map((time) => actorPose(actor, time, 'front').frame))
    expect(frames).toEqual(new Set([0, 1]))
    expect(actorPose(actor, 50_050, 'front').expression).toBe('blink')
    expect(actorPose(actor, 50_300, 'front').expression).not.toBe('blink')
  })

  it('leans toward the monitor in the direction of each row', () => {
    const actor = createActor('checker', 9, 0)
    actor.action = 'peer'
    actor.startedAt = 0
    actor.endsAt = 10_000
    actor.nextBlinkAt = 90_000
    expect(actorPose(actor, 100, 'front').headDrop).toBe(1)
    expect(actorPose(actor, 100, 'back').headDrop).toBe(-1)
  })

  it('offers a still typing pose for reduced motion', () => {
    expect(staticPose()).toMatchObject({ pose: 'type', frame: 0, effect: 'none' })
  })
})
