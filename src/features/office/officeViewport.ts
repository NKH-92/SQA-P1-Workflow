import { CORE_CAMERA, type OfficeCamera } from './officeGeometry'
import { SCENE_FOCUS_LEFT, SCENE_FOCUS_RIGHT } from './officeScene'

export type OfficeViewportState = {
  /** 캔버스 실제 크기(픽셀) */
  canvasWidth: number
  canvasHeight: number
  /** 논리 픽셀 하나가 차지하는 CSS 픽셀(카드 폭을 채우려고 소수일 수 있다) */
  cssScale: number
  cssWidth: number
  cssHeight: number
  /**
   * 캔버스를 화면보다 크게(2배) 그려 두고 브라우저가 부드럽게 줄이는지.
   * 장치 픽셀 기준 2배 미만에서 도트를 그대로 늘리면 한 칸이 1px·2px로 들쭉날쭉해져서 이렇게 한다.
   */
  smooth: boolean
  /** 장면이 카드보다 넓어 옆으로 밀어 봐야 하는지(좁은 화면) */
  scrollable: boolean
  /** 많이 넘쳐서(15% 넘게) ‘옆으로 밀어서 둘러보기’ 안내가 필요한지 */
  scrollHint: boolean
}

/** 이 배율보다 작으면 캐릭터가 너무 작아 보여서, 폭이 좁으면 줄이는 대신 옆으로 밀어 보게 한다. */
const MIN_READABLE_CSS_SCALE = 1.5
/** 정수 배율로도 폭을 이만큼 채우면 정수 배율을 써서 도트 크기를 완전히 고르게 한다. */
const INTEGER_FILL_RATIO = 0.95
/** 이 장치 배율부터는 도트를 그대로 늘려도(한 칸 2~3px) 고르게 보인다. */
const CRISP_DEVICE_SCALE = 2
/** 전체 화면 사무실을 세로로 긴 화면(휴대폰)에서 볼 때 높이를 채우는 최대 배율. 그 대신 옆으로 밀어 본다. */
const MAX_TALL_FILL_CSS_SCALE = 2.4

/**
 * 담을 폭·높이와 화면 배율(devicePixelRatio)로 장면을 얼마나 키울지 정한다.
 * 넓은 화면에서는 사무실이 홈의 주인공이 되도록 폭(전체 화면이면 폭과 높이)을 꽉 채우고,
 * 좁은 화면에서는 캐릭터가 읽히는 크기를 지킨 채 옆으로 밀어 보게 한다.
 * camera는 화면에 담을 영역이다(기존 화면 카드는 원래 장면, 전체 화면은 월드 전체).
 */
export function computeOfficeViewport(
  availableCssWidth: number,
  devicePixelRatio: number,
  maxCssHeight: number,
  camera: OfficeCamera = CORE_CAMERA,
  /** 전체 화면처럼 높이가 넉넉하면, 폭이 좁을 때 높이를 채워 크게 보여 준다(옆으로 밀어 보기). */
  fillHeight = false,
): OfficeViewportState {
  const sceneWidth = camera.width
  const sceneHeight = camera.height
  const ratio = Math.max(0.5, Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1)
  const available = Math.max(0, availableCssWidth)
  const heightLimit = Math.max(1, maxCssHeight) / sceneHeight
  const fit = Math.min(available / sceneWidth, heightLimit)

  /** 화면에 보이는 장치 픽셀 배율 */
  let deviceScale: number
  /** 캔버스에 그리는 배율 */
  let canvasScale: number
  if (fit >= MIN_READABLE_CSS_SCALE) {
    const exact = fit * ratio
    const whole = Math.floor(exact)
    if (whole >= 1 && whole / exact >= INTEGER_FILL_RATIO) {
      deviceScale = whole
      canvasScale = whole
    } else {
      deviceScale = exact
      canvasScale = exact >= CRISP_DEVICE_SCALE ? exact : CRISP_DEVICE_SCALE
    }
  } else {
    // 좁은 화면: 줄이지 않고 읽히는 크기(1.5배, 높이가 모자라면 그만큼)로 그린 뒤 옆으로 밀어 보게 한다.
    // 정수 장치 배율이 높이 안에 들어가면 그것을, 아니면 소수 배율을 쓴다.
    const readable = fillHeight ? Math.max(MIN_READABLE_CSS_SCALE, Math.min(MAX_TALL_FILL_CSS_SCALE, heightLimit)) : MIN_READABLE_CSS_SCALE
    const target = Math.max(1, Math.min(readable, heightLimit) * ratio)
    const whole = Math.ceil(target - 1e-6)
    deviceScale = whole <= heightLimit * ratio ? whole : target
    canvasScale = Number.isInteger(deviceScale) || deviceScale >= CRISP_DEVICE_SCALE ? deviceScale : CRISP_DEVICE_SCALE
  }

  const deviceWidth = Math.max(sceneWidth, Math.floor(sceneWidth * deviceScale + 1e-6))
  const deviceHeight = Math.max(sceneHeight, Math.round((deviceWidth * sceneHeight) / sceneWidth))
  const smooth = canvasScale > deviceScale
  const canvasWidth = smooth ? Math.round(sceneWidth * canvasScale) : deviceWidth
  const cssWidth = deviceWidth / ratio
  return {
    canvasWidth,
    canvasHeight: smooth ? Math.round(sceneHeight * canvasScale) : deviceHeight,
    cssScale: cssWidth / sceneWidth,
    cssWidth,
    cssHeight: deviceHeight / ratio,
    smooth,
    scrollable: cssWidth > available + 0.5,
    scrollHint: cssWidth > available * 1.15,
  }
}

/** 옆으로 밀어 보는 장면을 처음 열 때 책상 섬이 가운데 오도록 하는 가로 스크롤 위치 */
export function initialOfficeScroll(viewport: OfficeViewportState, containerWidth: number, camera: OfficeCamera = CORE_CAMERA): number {
  if (!viewport.scrollable) return 0
  const center = ((SCENE_FOCUS_LEFT + SCENE_FOCUS_RIGHT) / 2 - camera.x) * viewport.cssScale
  return Math.max(0, Math.min(viewport.cssWidth - containerWidth, Math.round(center - containerWidth / 2)))
}
