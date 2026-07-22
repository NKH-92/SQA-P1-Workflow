# SQA P1 Workflow · 디자인 토큰 계약 (V4 Brand Operations)

모든 색·크기·간격·라운드·그림자는 이 문서의 토큰으로만 쓴다.
새 값이 필요하면 **먼저 여기에 토큰을 추가**하고 `src/styles.css`의 `:root`에 반영한 뒤 사용한다.
컴포넌트 CSS에 원시 hex와 임의 간격 숫자를 직접 쓰지 않는다.

- 방향: 10인 SQA 파트의 매일 쓰는 내부 운영 도구. 짙은 네이비 Shell, 파란 운영 맥락,
  흰색·쿨 그레이 업무 표면이 하나의 **데이터 우선 Brand Operations** 언어를 이룬다.
  에디토리얼 장식(질감 오버레이·세리프 이탤릭 숫자·영문 장식 라벨)은 쓰지 않는다.
- 다이얼: `DESIGN_VARIANCE 3 · MOTION_INTENSITY 2 · VISUAL_DENSITY 7`

## 1. 분위기 (Atmosphere)

- 명확하고 차분한 운영 콘솔. 네이비 Shell, 밝은 파란 운영 히어로, 흰색·쿨 그레이 업무 표면을 조합한다.
- 화면의 주인공은 데이터 행이다. 컨테이너는 조용히 물러난다(얇은 보더 + 최소 그림자).
- 금지: 전면 질감 오버레이, 사선/찢어진 가장자리 장식, 비인터랙티브 요소의 hover 반응,
  영문 대문자 장식 라벨(마이크로 카피는 한국어), 이모지 아이콘.

## 2. 색 (Color)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--paper-bg` | `#f4f7fb` | 앱 캔버스(호환 토큰) |
| `--paper-bg-alt` | `#eef3f9` | 테이블 헤더·보조 표면 |
| `--paper-panel` | `#ffffff` | 패널·카드 표면 |
| `--paper-panel-warm` | `#f6f9fd` | 선택·행 hover 표면(호환 이름) |
| `--paper-border` | `#d8e1ed` | 기본 보더 |
| `--paper-border-strong` | `#b8c5d6` | hover 보더·스크롤바 |
| `--paper-ink` | `#142238` | 제목·최상위 텍스트 |
| `--paper-text` | `#26354a` | 본문 |
| `--paper-dim` | `#5c6b7e` | 보조 텍스트 |
| `--paper-faint` | `#6d7b8d` | 삼차 텍스트 |
| `--paper-accent` | `#105bd8` | 링크·포커스 액센트 |
| `--paper-accent-soft` | `#2d6cdf` | 액센트 hover |
| `--paper-accent-deep` | `#0a47b6` | 액센트 강조 텍스트 |
| `--paper-accent-bg` | `#e8f0ff` | 액센트 배경 |
| `--paper-accent-bg-deep` | `#d8e6ff` | 선택 배경 |
| `--paper-hover` | `#eef3f9` | 행 hover 배경 |
| `--paper-on-accent` | `#ffffff` | 채워진 배경(액센트·상태색) 위 텍스트 |
| `--paper-reject-deep` | `#873038` | danger 버튼 hover 심화 |
| `--paper-pending-deep` | `#754a08` | pending-bg 위 강조 텍스트 |
| `--paper-shimmer` | `#f7f9fc` | 로딩 스켈레톤 하이라이트 |

상태색(배지·바·칩이 공유하는 유일한 매핑):

| 상태 | 전경 | 배경 | 의미 |
|---|---|---|---|
| pending / due_soon | `--paper-pending` `#98620d` | `--paper-pending-bg` `#fff2cf` | 대기·임박 |
| in_progress | `--paper-review` `#17659a` | `--paper-review-bg` `#dceeff` | 진행 중 |
| approved / done | `--paper-done` `#28734d` | `--paper-done-bg` `#dff3e8` | 완료 |
| rejected / overdue / due_now | `--paper-reject` `#a43e45` | `--paper-reject-bg` `#f8dfe1` | 반려·지연 |
| planned / scheduled / no_due | `--paper-planned` `#5c6b7e` | `--paper-planned-bg` `#e8edf4` | 예정·기한 없음 |
| urgent | `--paper-urgent` `#a83c32` | `--paper-urgent-bg` `#fbe2dc` | 긴급 표시(카운트·바) |

- 계층 `ink > text > dim > faint`를 유지한다. 값을 바꾸면 대비를 다시 계산한다.
- 상태색은 상태 의미로만 쓰고 장식으로 쓰지 않는다.

### 2.1 Brand Shell 범위 토큰

브랜드 토큰은 `.brand-shell` 아래의 사이드바·탑바·대시보드 히어로·주요 행동뿐 아니라
선택 상태, 포커스, 업무 맥락 표시에도 일관되게 쓴다. 표·리스트·상세 패널은 흰색·쿨 그레이
표면과 기존 의미 상태색을 유지하며, 세피아·크림·갈색 액센트는 사용하지 않는다.

| 토큰 | 값 | 용도 |
|---|---|---|
| `--brand-navy` | `#071b34` | 사이드바 기본 표면 |
| `--brand-navy-deep` | `#041326` | 사이드바 깊이·멤버 행동 콜아웃 |
| `--brand-blue` | `#105bd8` | 운영 히어로·브랜드 포커스 |
| `--brand-blue-deep` | `#0a47b6` | 히어로 그라데이션 끝·hover |
| `--brand-blue-soft` | `#e8f0ff` | 브랜드 선택·보조 배경 |
| `--brand-yellow` | `#ffcc3d` | 활성 네비게이션·주요 행동 |
| `--brand-yellow-hover` | `#f4b91b` | 노란 주요 행동 hover |
| `--brand-on-dark` | `#ffffff` | 네이비·파란 표면 위 텍스트 |
| `--brand-on-yellow` | `#132033` | 노란 표면 위 텍스트 |
| `--brand-sidebar-muted` | `rgba(255, 255, 255, 0.68)` | 사이드바 보조 텍스트 |
| `--brand-sidebar-border` | `rgba(255, 255, 255, 0.12)` | 사이드바 구분선 |

- 활성 네비게이션은 노란 배경과 `--brand-on-yellow` 조합 하나로 표현한다.
- 검토 처리율은 서버 집계 이벤트로 계산하며, 접수가 0이면 퍼센트를 표시하지 않는다.
- 팀 배분 막대는 제품·정기 업무·진행 중 프로젝트의 **담당 항목 수**만 뜻한다. 업무량·난이도·성과·가동률로 표현하지 않는다.
- 파트원 홈에는 주간 완료율·목표 달성률처럼 현재 데이터로 검증할 수 없는 수치를 만들지 않는다.

## 3. 타이포그래피 (Typography)

| 토큰 | 스택 | 용도 |
|---|---|---|
| `--font-sans` | Inter Variable + Noto Sans KR 폴백 | 본문·UI·**모든 숫자** |
| `--font-serif` / `--font-serif-display` | `--font-sans`와 동일한 호환 별칭 | 기존 셀렉터를 깨지 않고 전 화면 산스 통일 |
| `--font-mono` | JetBrains Mono Variable | ID·코드·시각(時刻) 등 기계값 |

- **숫자 규칙**: 데이터 숫자(카운트·KPI·순번·부하)는 산스 + `font-variant-numeric: tabular-nums`.
  세리프 이탤릭 숫자는 금지(브랜드 마크 'P'와 아바타 이니셜만 예외).
- **라벨 규칙**: UI 마이크로 라벨은 한국어, 최소 11px. 영문 대문자 트래킹 라벨은 쓰지 않는다.
  예외: 사이드바 브랜드 워드마크("SQA P1 / WORKFLOW") 한 곳만 허용 — 로고 록업이지 UI 라벨이 아니다.
  기계값(mono 숫자·시각·키캡)은 최소 10.5px.
- 크기 스케일(현재 사용 값): 10 / 10.5 / 11 / 11.5 / 12 / 12.5 / 13 / 13.5 / **14(본문)** / 14.5 / 15 / 16 / 17 / 18 / 19 / 20 / 21 / 22 / 24 / 26 / 27 / 34px.
  신규 코드는 이 목록 안에서 고르고, 새 크기를 추가하려면 여기 먼저 등재한다.

## 4. 간격·레이아웃 (Spacing)

- 간격 단위: 기존 밀도와 정보량을 유지하는 base 1px 광학 보정 스케일. 새 레이아웃은 가능한 한
  4px 배수 권장값을 사용하되, 기존 기능 화면의 안정적인 밀도는 유지한다.
- 신규 코드의 권장 값: 2 / 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 24 / 26 / 32 / 44px.
  이 목록 밖 값을 쓰려면 인접 요소와의 광학 정렬 근거가 있어야 한다.
- 구조: `--sidebar-w: 220px`, `--topbar-h: 56px`, 콘텐츠 최대폭 1400px.
- **밀도 2모드**: 기본(comfortable)과 압축(compact). 압축은 `:root[data-density='compact']` 하위의
  셀렉터별 간격 오버라이드로만 구현한다(`src/styles.css` "밀도 압축 모드" 절 — `.stack` gap 26→14px,
  `.row` 패딩 10→6px, 섹션·리스트 패딩 축소). 글자 크기는 밀도 모드로 줄이지 않는다.

## 5. 컴포넌트 (Components)

- 라운드 잠금: `--radius-sm 5 / md 8 / lg 12 / xl 16 / full`. 이 스케일 밖 라운드 금지.
  예외: 폭 3~4px 상태 바의 끝단 라운드(≤2px)와 컨페티 입자처럼 토큰보다 작은 장식 요소.
- 버튼: `.primary`(잉크 배경) / `.ghost`(패널) / `.danger`(reject). compact 변형 30px.
- 배지: `data-status` 기반, 상태색 매핑(§2)만 사용.
- 리스트 행: 좌측 3px 상태/긴급도 바(`::before`)가 시급도의 표준 문법.
- KPI 스탯: 라벨(한국어 11~11.5px, dim) + 값(산스 22~24px tabular-nums) + 단위(12px dim).
- 빈 상태: 아이콘(faint) + 본문 1줄 + (선택) 행동 버튼. 이탤릭 세리프 문구는 쓰지 않는다.
- 토스트: 우하단 고정, `--shadow-lg`, tone별 상태색. topbar에는 저장 중/동기화 라벨만 남긴다.
- 아이콘: lucide-react 단일 패밀리, stroke 1.8, 장식용 hand-rolled SVG 금지.
- 마스터-디테일: 공지·검토·변경·파트원 화면은 데스크톱에서 좌측 탐색/우측 상세의 동일한
  작업대 패턴을 쓴다. 1080px 이하에서는 1열로 접고 상세의 sticky를 해제한다.
- 변경 완료: 모든 활성 제품 업무가 `completed`일 때만 초록 완료 의미를 사용한다.
  `not_applicable`이 포함된 100% 처리는 “전체 처리”일 뿐 “모든 제품 적용 완료”로 표시하지 않는다.
  자동 보관 뒤에도 리더 KPI·완료 알림·변경 상세 배너에서 완료 신호를 유지한다.

## 6. 모션 (Motion)

- `--dur-fast 150ms / --dur-normal 250ms`, `--ease-out / --ease-deep / --ease-spring`.
- transform·opacity·filter만 애니메이션. 레이아웃 속성 애니메이션 금지.
- hover 반응은 **클릭 가능한 요소에만** 허용.
- `prefers-reduced-motion: reduce`에서 모든 애니메이션을 1ms로 축소한다.

## 7. 깊이 (Depth)

| 토큰 | 용도 |
|---|---|
| `--shadow-xs` | 카드 기본 |
| `--shadow-sm` | 카드 hover(클릭 가능한 것만) |
| `--shadow-md` | 떠 있는 강조(버튼 hover·폼) |
| `--shadow-lg` | 모달·팔레트·토스트 |
| `--shadow-glow` | 포커스 링 보조(입력 필드) |

- 그림자는 이 4단계 사다리만. 임의 box-shadow 금지.
- 예외(링): 선택/현재 상태 표시는 elevation이 아니라 링이다 — `inset 0 0 0 1px <border 토큰>` 또는
  `0 0 0 3~4px <상태색 bg 토큰>` 형태만 허용하고, 그림자 사다리와 섞어 쓸 수 있다.
  (활성 네비, 선택된 리스트 행·카드, 타임라인 current 스텝이 이 패턴을 쓴다.)
- 포커스 표시는 `outline: 2px solid var(--paper-accent)` (비텍스트 대비 3:1 이상).
