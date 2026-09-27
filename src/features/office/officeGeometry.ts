/**
 * 사무실 좌표계. 논리 픽셀 단위이고, 원래 장면(책상 섬이 있는 방 윗부분)은 x 0~384, y 0~128이다.
 * 전체 화면 사무실(월드)은 같은 좌표계를 그대로 쓰면서 양옆·아래로 넓힌다. 그래서 기존 좌표는 바뀌지 않는다.
 */
export const SCENE_WIDTH = 384
export const SCENE_HEIGHT = 128
/** 기물 간판을 거는 천장 쪽 벽 띠. 장면 좌표 y=0 위에 덧붙여 그린다. */
export const SCENE_TOP_BAND = 12
/** 기존 화면 카드에 보이는 높이(천장 띠 + 장면) */
export const VIEW_HEIGHT = SCENE_HEIGHT + SCENE_TOP_BAND
/** 뒤쪽 벽 아래 끝(바닥이 시작하는 y) */
export const WALL_BOTTOM = 40

/** 전체 화면 사무실(16:9). 왼쪽·오른쪽 벽을 48씩, 아래로 회의실·출입구·샘플 보관 구역을 130만큼 넓혔다. */
export const WORLD_LEFT = -48
export const WORLD_RIGHT = SCENE_WIDTH + 48
export const WORLD_TOP = -SCENE_TOP_BAND
export const WORLD_BOTTOM = SCENE_HEIGHT + 130
export const WORLD_WIDTH = WORLD_RIGHT - WORLD_LEFT
export const WORLD_HEIGHT = WORLD_BOTTOM - WORLD_TOP

/** 화면에 담을 영역(월드 좌표) */
export type OfficeCamera = { x: number; y: number; width: number; height: number }

/** 기존 화면 카드: 원래 장면만 보인다. */
export const CORE_CAMERA: OfficeCamera = { x: 0, y: WORLD_TOP, width: SCENE_WIDTH, height: VIEW_HEIGHT }
/** 전체 화면 사무실: 월드 전체가 보인다. */
export const WORLD_CAMERA: OfficeCamera = { x: WORLD_LEFT, y: WORLD_TOP, width: WORLD_WIDTH, height: WORLD_HEIGHT }

export function isWorldCamera(camera: OfficeCamera) {
  return camera.width > SCENE_WIDTH || camera.height > VIEW_HEIGHT
}

/** 영역 안(일부라도)에 있는지 */
export function intersectsCamera(camera: OfficeCamera, area: { x: number; y: number; w: number; h: number }) {
  return area.x < camera.x + camera.width
    && area.x + area.w > camera.x
    && area.y < camera.y + camera.height
    && area.y + area.h > camera.y
}
