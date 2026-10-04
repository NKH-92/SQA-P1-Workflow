import type { AppData, Profile } from '../../../types'
import { buildDeskCounts, deskPileLevel, buildOfficeAlerts, newOfficeAssignmentKeys } from '../officeAlerts'
import { prefersReducedMotion } from '../../../lib/motion'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { PresenceKind } from '../../../data/validation/memberPresence'
import { businessDateParts } from '../../../lib/businessTime'
import type { OfficeAlert } from '../officeAlerts'
import { CORE_CAMERA, intersectsCamera, type OfficeCamera } from '../officeGeometry'
import { seatRowLabel, type SceneOccupant } from '../officeLayoutModel'
import { createOfficeRenderer, type OfficeBubble, type OfficeClock, type OfficeRenderer } from '../officeRenderer'
import { SCENE_HOTSPOTS, SCENE_SEATS, type SceneHotspotId } from '../officeScene'
import { skyPeriodForHour } from '../officeSky'
import { computeOfficeViewport, initialOfficeScroll, type OfficeViewportState } from '../officeViewport'
import { PixelIcon } from './PixelIcon'

/** 캐릭터 동작은 도트 느낌이 나도록 초당 10장만 그린다. */
const FRAME_INTERVAL = 100
/**
 * 넓은 화면에서는 사무실이 홈의 주인공이 되도록 카드 폭을 채우되, 창 높이의 56%(312~560px)를 넘지 않는다.
 * 휴대폰 폭(≤640px)에서는 할 일 목록 첫 줄이 첫 화면에 보이도록 창 높이의 28%(150~236px)까지만 쓴다.
 */
const DESKTOP_HEIGHT_RATIO = 0.56
const MIN_HEIGHT_DESKTOP = 312
const MAX_HEIGHT_DESKTOP = 560
const MOBILE_HEIGHT_RATIO = 0.28
const MIN_HEIGHT_MOBILE = 150
const MAX_HEIGHT_MOBILE = 236
/** 말풍선 꼬리를 자리 열마다 조금씩 옮겨 양 끝 자리 말풍선이 장면 밖으로 넘치지 않게 한다. */
const BUBBLE_SHIFT = ['-24%', '-42%', '-58%', '-76%'] as const
/** 누르는 영역의 최소 크기(CSS px). 도트가 작아도 누르기 쉽게 한다. */
const MIN_HIT = 36
/** 옆자리 사이 거리(논리 픽셀). 자리 상태 칩이 옆 칩과 겹치지 않게 이 폭 안에서 줄인다. */
const SEAT_GAP = 40

export type OfficeHotspotLink = {
  id: SceneHotspotId
  /** 기물 위 간판에 늘 보이는 갈 곳 이름. 예: ‘검토요청’ */
  sign: string
  /** 보조기기가 읽는 이름. 예: ‘검토요청 보드, 새 검토요청 2건, 검토요청으로 이동’ */
  label: string
  /** 새 소식(느낌표·빨간 간판)이나 처리할 일(숫자) */
  alert?: OfficeAlert
  /** 숫자 대신 간판에 붙일 짧은 표시(예: 회의 확인 ‘3/5’) */
  badge?: string
  onSelect: () => void
}

export type OfficePersonLink = {
  label: string
  onSelect: () => void
}

/** 사무실 회의실 상태(자리 번호). 확인한 사람은 회의실로 가고, 아직인 사람 머리 위에는 느낌표가 뜬다. */
export type OfficeSceneMeeting = {
  attendeeSeats: readonly number[]
  invitedSeats: readonly number[]
}

/** 자리를 비운 사람: 캐릭터 대신 빈 의자와 도트 표지가 보이고, 이름표 아래에 짧은 설명이 붙는다. */
export type OfficeSceneAbsence = {
  seatIndex: number
  kind: PresenceKind
  /** 보조기기가 읽는 설명(예: ‘휴가 · 10월 2일까지’) */
  summary: string
  /** 이름표 아래 칩에 보이는 짧은 글(예: ‘휴가 ~10/2’). 없으면 summary */
  chip?: string
}

const NO_SEATS: readonly number[] = []
const NO_ABSENCES: readonly OfficeSceneAbsence[] = []

function seoulClock(): OfficeClock {
  const parts = businessDateParts(new Date())
  return { hour: parts.hour, minute: parts.minute }
}

function horizontalPadding(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  return (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0)
}

/** 안쪽 여백을 뺀 실제 폭. clientWidth는 반올림돼 소수 폭에서 장면이 0.5px 넘칠 수 있어 소수 폭을 내림한다. */
function contentWidth(element: HTMLElement) {
  return Math.floor(element.getBoundingClientRect().width - horizontalPadding(element))
}

/** 전체 화면 사무실이 쓸 수 있는 높이(스크롤 막대 자리를 조금 남긴다) */
function contentHeight(element: HTMLElement) {
  return Math.floor(element.getBoundingClientRect().height)
}

function maxSceneHeight() {
  const [ratio, min, max] = window.innerWidth <= 640
    ? [MOBILE_HEIGHT_RATIO, MIN_HEIGHT_MOBILE, MAX_HEIGHT_MOBILE]
    : [DESKTOP_HEIGHT_RATIO, MIN_HEIGHT_DESKTOP, MAX_HEIGHT_DESKTOP]
  return Math.round(Math.min(max, Math.max(min, window.innerHeight * ratio)))
}

export function OfficeScene({
  occupants,
  currentProfileId,
  hotspots = [],
  personLink,
  camera = CORE_CAMERA,
  fit = 'card',
  meeting,
  absences = NO_ABSENCES,
  children,
  workflow,
  focusedProfileId,
}: {
  workflow?: { profile: Profile; data: AppData }
  focusedProfileId?: string | null
  occupants: readonly SceneOccupant[]
  currentProfileId: string
  hotspots?: readonly OfficeHotspotLink[]
  /** 사람을 눌렀을 때 갈 곳. null이면 누를 수 없다(이름만 보인다). */
  personLink?: (occupant: SceneOccupant) => OfficePersonLink | null
  /** 화면에 담을 영역. 기존 화면 카드는 원래 장면, 전체 화면은 월드 전체 */
  camera?: OfficeCamera
  /** card: 카드 폭에 맞추고 높이는 상한까지 / fullscreen: 부모 영역(폭·높이)을 채운다 */
  fit?: 'card' | 'fullscreen'
  meeting?: OfficeSceneMeeting
  /** 자리를 비운 사람(휴가·출장·현장·다른 곳 회의 등) */
  absences?: readonly OfficeSceneAbsence[]
  /** 장면 위에 겹쳐 보여 줄 안내(빈 사무실 등) */
  children?: ReactNode
}) {
  const previousViewer = useRef<string | null>(null)
  const previousWorkKeys = useRef<string[]>([])
  const previousAlerts = useRef<ReturnType<typeof buildOfficeAlerts> | null>(null)
  const deskCounts = workflow ? buildDeskCounts(workflow.profile, workflow.data) : new Map<number, number>()
  const cameraRef = useRef(camera)
  const attendeeSeats = meeting?.attendeeSeats ?? NO_SEATS
  const invitedSeats = meeting?.invitedSeats ?? NO_SEATS
  // 부모가 매번 새 배열을 넘겨도 회의실·자리 상태가 실제로 바뀔 때만 렌더러에 알린다.
  const attendeeKey = attendeeSeats.join(',')
  const absenceKey = absences.map((absence) => `${absence.seatIndex}:${absence.kind}`).join(',')
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<OfficeRenderer | null>(null)
  useLayoutEffect(() => {
    cameraRef.current = camera
  }, [camera])
  const redrawRef = useRef<() => void>(() => undefined)
  const viewportRef = useRef<OfficeViewportState | null>(null)
  const peopleRef = useRef(new Map<number, HTMLLIElement>())
  const [viewport, setViewport] = useState<OfficeViewportState | null>(null)
  const [bubbles, setBubbles] = useState<OfficeBubble[]>([])
  const [skyPeriod, setSkyPeriod] = useState(() => skyPeriodForHour(seoulClock().hour))

  /**
   * 렌더러가 알려 주는 사람 위치에 이름표·누르는 영역·말풍선을 옮긴다.
   * 초당 열 번 바뀌므로 React 상태를 거치지 않고 요소 스타일만 고친다.
   */
  const syncOverlay = useCallback(() => {
    const renderer = rendererRef.current
    const current = viewportRef.current
    if (!renderer || !current) return
    const view = cameraRef.current
    for (const anchor of renderer.anchors()) {
      const item = peopleRef.current.get(anchor.seatIndex)
      if (!item) continue
      item.style.transform = `translate(${(anchor.x - view.x) * current.cssScale}px, ${(anchor.headTop - view.y) * current.cssScale}px)`
      item.style.setProperty('--office-hit-h', `${Math.max(MIN_HIT, (anchor.bottom - anchor.headTop + 3) * current.cssScale)}px`)
      if (anchor.labelBelowY === null) {
        item.dataset.label = 'above'
        item.style.removeProperty('--office-label-y')
      } else {
        item.dataset.label = 'below'
        item.style.setProperty('--office-label-y', `${(anchor.labelBelowY - anchor.headTop) * current.cssScale}px`)
      }
      item.dataset.standing = anchor.standing ? 'true' : 'false'
    }
  }, [])

  // 렌더러와 그리기 반복. 화면 밖이거나 탭이 가려지면 멈추고, 동작 줄이기면 멈춘 한 장면만 그린다.
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const renderer = createOfficeRenderer(canvas, { onBubblesChange: setBubbles })
    if (!renderer) return
    rendererRef.current = renderer

    let animate = !prefersReducedMotion()
    let onScreen = true
    let frameId = 0
    let timerId = 0
    let lastDraw = -Infinity
    let clock = seoulClock()
    let clockCheckedAt = 0

    const draw = (now: number) => {
      if (now - clockCheckedAt > 20_000) {
        clock = seoulClock()
        clockCheckedAt = now
        setSkyPeriod(skyPeriodForHour(clock.hour + clock.minute / 60))
      }
      renderer.draw(now, { animate, clock })
      syncOverlay()
    }
    const tick = (now: number) => {
      frameId = 0
      if (now - lastDraw >= FRAME_INTERVAL) {
        lastDraw = now
        draw(now)
      }
      schedule()
    }
    // 매 화면 주사율마다 깨어나지 않도록, 다음 장까지 남은 시간은 타이머로 기다렸다가 프레임을 한 번만 예약한다.
    const schedule = () => {
      if (!animate || !onScreen || document.hidden || frameId || timerId) return
      const wait = FRAME_INTERVAL - (performance.now() - lastDraw)
      if (wait <= 0) {
        frameId = window.requestAnimationFrame(tick)
        return
      }
      timerId = window.setTimeout(() => {
        timerId = 0
        frameId = window.requestAnimationFrame(tick)
      }, wait)
    }
    const stop = () => {
      if (frameId) window.cancelAnimationFrame(frameId)
      if (timerId) window.clearTimeout(timerId)
      frameId = 0
      timerId = 0
    }
    redrawRef.current = () => {
      clockCheckedAt = 0
      draw(performance.now())
      schedule()
    }

    const onVisibility = () => (document.hidden ? stop() : schedule())
    document.addEventListener('visibilitychange', onVisibility)
    const motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    const onMotionChange = () => {
      animate = !prefersReducedMotion()
      stop()
      redrawRef.current()
    }
    motionQuery?.addEventListener?.('change', onMotionChange)
    const intersection = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          onScreen = entries.some((entry) => entry.isIntersecting)
          if (onScreen) schedule()
          else stop()
        })
      : null
    intersection?.observe(container)
    // 멈춘 화면에서도 벽시계는 맞게 보이도록 가끔 다시 그린다.
    const staticClock = window.setInterval(() => {
      if (!animate) redrawRef.current()
    }, 30_000)



  return () => {
      stop()
      window.clearInterval(staticClock)
      intersection?.disconnect()
      motionQuery?.removeEventListener?.('change', onMotionChange)
      document.removeEventListener('visibilitychange', onVisibility)
      renderer.destroy()
      rendererRef.current = null
      redrawRef.current = () => undefined
    }
  }, [syncOverlay])

  // 카드(또는 전체 화면 영역) 크기가 바뀌면 배율을 다시 정한다.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      // 안쪽 여백을 뺀 폭에 맞춰야 장면이 max-width에 눌려 찌그러지지 않는다.
      const height = fit === 'fullscreen' ? contentHeight(container) : maxSceneHeight()
      const next = computeOfficeViewport(contentWidth(container), window.devicePixelRatio || 1, height, cameraRef.current, fit === 'fullscreen')
      setViewport((current) => (
        current
        && current.canvasWidth === next.canvasWidth
        && current.canvasHeight === next.canvasHeight
        && current.cssScale === next.cssScale
        && current.smooth === next.smooth
        && current.scrollable === next.scrollable
        && current.scrollHint === next.scrollHint
          ? current
          : next
      ))
    }
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(container)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [camera, fit])

  useEffect(() => {
    rendererRef.current?.setCamera(camera)
    redrawRef.current()
  }, [camera])

  useEffect(() => {
    rendererRef.current?.setMeeting(attendeeKey ? attendeeKey.split(',').map(Number) : [])
    redrawRef.current()
  }, [attendeeKey])

  useEffect(() => {
    rendererRef.current?.setAbsences(absenceKey
      ? absenceKey.split(',').map((item) => {
          const [seat, kind] = item.split(':')
          return { seatIndex: Number(seat), kind: kind as PresenceKind }
        })
      : [])
    redrawRef.current()
  }, [absenceKey])

  useEffect(() => {
    viewportRef.current = viewport
    const renderer = rendererRef.current
    if (!renderer || !viewport) return
    renderer.setViewport(viewport)
    redrawRef.current()
  }, [viewport])

  // 좁은 화면에서는 배율이 정해질 때마다 책상 섬이 가운데 오도록 옆으로 밀어 둔다.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || !viewport?.scrollable) return
    container.scrollLeft = initialOfficeScroll(viewport, contentWidth(container), cameraRef.current)
  }, [viewport])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    renderer.setOccupants(occupants.map((occupant) => ({ seatIndex: occupant.seatIndex, character: occupant.character })))
    // 사람이 바뀌어도 카메라·회의실·자리 상태는 그대로 이어 간다.
    renderer.setCamera(cameraRef.current)
    redrawRef.current()
  }, [occupants])

  // 사람이 바뀌거나 배율이 바뀌면 이름표를 바로 제자리에 놓는다(다음 장을 기다리지 않는다).
  useLayoutEffect(() => {
    viewportRef.current = viewport
    syncOverlay()
  }, [occupants, viewport, bubbles, syncOverlay])

  const registerPerson = (seatIndex: number) => (item: HTMLLIElement | null) => {
    if (item) peopleRef.current.set(seatIndex, item)
    else peopleRef.current.delete(seatIndex)
  }

  const stageStyle: CSSProperties | undefined = viewport
    ? {
        width: `${viewport.cssWidth}px`,
        height: `${viewport.cssHeight}px`,
        '--office-hit-w': `${Math.max(MIN_HIT, 22 * viewport.cssScale)}px`,
        '--office-seat-gap': `${SEAT_GAP * viewport.cssScale}px`,
      } as CSSProperties
    : undefined
  const bubbleBySeat = new Map(bubbles.map((bubble) => [bubble.seatIndex, bubble]))
  const absenceBySeat = new Map(absences.map((absence) => [absence.seatIndex, absence]))
  const invited = new Set(invitedSeats)
  const visibleHotspots = hotspots.flatMap((hotspot) => {
    const area = SCENE_HOTSPOTS.find((item) => item.id === hotspot.id)
    return area && intersectsCamera(camera, area) ? [{ hotspot, area }] : []
  })

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer || !workflow) return
    const counts = buildDeskCounts(workflow.profile, workflow.data)
    renderer.setDeskPiles(new Map([...counts].map(([seat, count]) => [seat, deskPileLevel(count)])))
    redrawRef.current()
    const next = buildOfficeAlerts(workflow.profile, workflow.data)
    const keys = newOfficeAssignmentKeys(workflow.profile, workflow.data)
    const previous = previousViewer.current === workflow.profile.id ? previousAlerts.current : null
    const oldKeys = previousWorkKeys.current
    previousViewer.current = workflow.profile.id
    previousWorkKeys.current = keys
    previousAlerts.current = workflow.data.sectionReadMarks === undefined ? null : next
    if (!previous) return
    const ownSeat = occupants.find(o => o.profileId === workflow.profile.id)?.seatIndex
    if (ownSeat && keys.some(key => !oldKeys.includes(key))) renderer.announceWork(ownSeat, performance.now())
    if (workflow.profile.role === 'leader' && !previous.kanban && next.kanban?.level === 'new') {
      const request = workflow.data.reviewRequests.find(r => r.id === next.kanban?.targetId && r.status === 'pending')
      const seat = occupants.find(o => o.profileId === request?.requester_id)?.seatIndex
      if (seat) renderer.deliverPaper(seat, performance.now())
    }
  }, [workflow, occupants])
  useEffect(() => {
    if (!focusedProfileId) return
    const seat = occupants.find(o => o.profileId === focusedProfileId)
    const element = seat ? containerRef.current?.querySelector<HTMLElement>(`[data-seat="${seat.seatIndex}"]`) : null
    if (!element) return
    element.dataset.focused = 'true'
    element.focus({ preventScroll: true })
    const timer = setTimeout(() => { delete element.dataset.focused }, 2000)
    return () => { clearTimeout(timer); delete element.dataset.focused }
  }, [focusedProfileId, occupants])

  return (
    <div className="office-scene-wrap" data-fit={fit} data-sky={skyPeriod}>
      <p className="sr-only">{`지금 창밖은 ${skyPeriod} 하늘이에요.`}</p>
      <div
        className="office-scene"
        data-fit={fit}
        data-scrollable={viewport?.scrollable ? 'true' : undefined}
        ref={containerRef}
      >
        <div className="office-stage" style={stageStyle}>
          <canvas aria-hidden="true" className="office-canvas" data-smooth={viewport?.smooth ? 'true' : undefined} ref={canvasRef} />
          <div className="office-overlay">
            {viewport && visibleHotspots.length > 0 && (
              <div aria-label="사무실 바로가기" className="office-hotspots" role="group">
                {visibleHotspots.map(({ hotspot, area }) => {
                  const scale = viewport.cssScale
                  return (
                    <button
                      aria-label={hotspot.label}
                      className="office-hotspot"
                      data-alert={hotspot.alert?.level}
                      data-hotspot={hotspot.id}
                      key={hotspot.id}
                      onClick={hotspot.onSelect}
                      title={hotspot.alert?.description}
                      style={{
                        left: `${(area.x - camera.x) * scale}px`,
                        top: `${(area.y - camera.y) * scale}px`,
                        width: `${area.w * scale}px`,
                        height: `${area.h * scale}px`,
                      }}
                      type="button"
                    >
                      {/* 간판은 늘 보여서 어디로 가는 기물인지 바로 알 수 있다. 눌러도 같은 곳으로 간다. */}
                      <span
                        aria-hidden="true"
                        className="office-hotspot-sign"
                        data-alert={hotspot.alert?.level}
                        style={{ left: `${(area.sign.x - area.x) * scale}px`, top: `${(area.sign.y - area.y) * scale}px` }}
                      >
                        {hotspot.alert?.level === 'new' && <span className="office-hotspot-marker">!</span>}
                        {hotspot.sign}
                        {hotspot.badge ? (
                          <span className="office-hotspot-count">{hotspot.badge}</span>
                        ) : hotspot.alert && (
                          <span className="office-hotspot-count">{hotspot.alert.count > 99 ? '99+' : hotspot.alert.count}</span>
                        )}
                        <span className="office-hotspot-arrow">›</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            <ul aria-label="자리 배치" className="office-people">
              {occupants.map((occupant) => {
                const seat = SCENE_SEATS[occupant.seatIndex - 1]
                if (!seat) return null
                const link = personLink?.(occupant) ?? null
                const bubble = bubbleBySeat.get(occupant.seatIndex)
                const absence = absenceBySeat.get(occupant.seatIndex)
                const isMe = occupant.profileId === currentProfileId
                return (
                  <li
                    className={`office-person${isMe ? ' is-me' : ''}`}
                    data-away={absence ? absence.kind : undefined}
                    data-invited={invited.has(occupant.seatIndex) ? 'true' : undefined}
                    data-label={seat.row === 'aisle' ? 'below' : 'above'}
                    tabIndex={-1}
                    data-seat={occupant.seatIndex}
                    key={occupant.seatIndex}
                    ref={registerPerson(occupant.seatIndex)}
                  >
                    {invited.has(occupant.seatIndex) && (
                      <span aria-hidden="true" className="office-person-marker">!</span>
                    )}
                    {link && (
                      <button
                        aria-label={link.label}
                        className="office-person-hit"
                        onClick={link.onSelect}
                        title={`${occupant.name} · ${occupant.character.personality.label}`}
                        type="button"
                      />
                    )}
                    <span className="office-name">
                      {occupant.name}
                      {isMe && <span className="sr-only">(나)</span>}
                    </span>
                    <span className="sr-only">
                      {`, ${occupant.seatIndex}번 자리 · ${seatRowLabel(occupant.seatIndex)} · ${occupant.character.personality.label}`}
                      {attendeeSeats.includes(occupant.seatIndex) ? ' · 회의 중' : invited.has(occupant.seatIndex) ? ' · 회의 요청 받음' : ''}
                      {absence ? ` · ${absence.summary}` : ''}
                      {deskCounts.get(occupant.seatIndex) ? ` · 대기 ${deskCounts.get(occupant.seatIndex)}건` : ''}
                    </span>
                    {absence && (
                      <span aria-hidden="true" className="office-away-chip" data-kind={absence.kind}>
                        <PixelIcon id={absence.kind} />
                        <span className="office-away-text">{absence.chip ?? absence.summary}</span>
                      </span>
                    )}
                    {bubble && (
                      <span
                        aria-hidden="true"
                        className="office-bubble"
                        style={{ '--office-bubble-shift': BUBBLE_SHIFT[(occupant.seatIndex - 1) % 4] } as CSSProperties}
                      >
                        {bubble.text}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
          {children}
        </div>
      </div>
      {viewport?.scrollHint && <p className="office-scroll-hint">옆으로 밀어서 사무실을 둘러볼 수 있어요.</p>}
    </div>
  )
}
