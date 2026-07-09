# SQA P1 Workflow · 디자인 토큰 계약 (V2 Warm Paper, Data-First 개정)

모든 색·크기·간격·라운드·그림자는 이 문서의 토큰으로만 쓴다.
새 값이 필요하면 **먼저 여기에 토큰을 추가**하고 `src/styles.css`의 `:root`에 반영한 뒤 사용한다.
컴포넌트 CSS에 원시 hex와 임의 간격 숫자를 직접 쓰지 않는다.

- 방향: 10인 SQA 파트의 매일 쓰는 내부 운영 도구. Warm Paper(스톤 뉴트럴 + 세피아 액센트)의 톤은 유지하되,
  에디토리얼 장식(질감 오버레이·세리프 이탤릭 숫자·영문 장식 라벨)은 걷어낸 **데이터 우선** 언어.
- 다이얼: `DESIGN_VARIANCE 3 · MOTION_INTENSITY 2 · VISUAL_DENSITY 7`

## 1. 분위기 (Atmosphere)

- 종이 위에 정돈된 업무 기록. 차분한 크림 배경, 잉크에 가까운 본문, 세피아 한 가지 액센트.
- 화면의 주인공은 데이터 행이다. 컨테이너는 조용히 물러난다(얇은 보더 + 최소 그림자).
- 금지: 전면 질감 오버레이, 사선/찢어진 가장자리 장식, 비인터랙티브 요소의 hover 반응,
  영문 대문자 장식 라벨(마이크로 카피는 한국어), 이모지 아이콘.

## 2. 색 (Color)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--paper-bg` | `#f4f0e6` | 앱 배경 |
| `--paper-bg-alt` | `#ece6d5` | 사이드바·테이블 헤더 배경 |
| `--paper-panel` | `#fdfcf7` | 패널·카드 표면 |
| `--paper-panel-warm` | `#faf6ec` | 강조 표면(선택 행 등) |
| `--paper-border` | `#e0d9c6` | 기본 보더 |
| `--paper-border-strong` | `#cec4a9` | hover 보더·스크롤바 |
| `--paper-ink` | `#1c1a15` | 제목·최상위 텍스트 |
| `--paper-text` | `#2c2822` | 본문 |
| `--paper-dim` | `#625c4e` | 보조 텍스트 (패널 대비 6.5:1) |
| `--paper-faint` | `#787162` | 삼차 텍스트 (패널 대비 4.7:1, 12px까지 AA) |
| `--paper-accent` | `#8b5a2b` | 유일한 액센트(세피아). 링크·활성·포커스 |
| `--paper-accent-soft` | `#a06f42` | 액센트 hover |
| `--paper-accent-deep` | `#6b4520` | 액센트 텍스트 온 액센트-bg |
| `--paper-accent-bg` | `#efe4cc` | 액센트 배경 |
| `--paper-accent-bg-deep` | `#e3d1a8` | 선택 배경 |
| `--paper-hover` | `#ede6d3` | 행 hover 배경 |
| `--paper-on-accent` | `#ffffff` | 채워진 배경(액센트·상태색) 위 텍스트 |
| `--paper-reject-deep` | `#79383a` | danger 버튼 hover 심화 |
| `--paper-pending-deep` | `#7d5216` | pending-bg 위 강조 텍스트 |
| `--paper-shimmer` | `#f5f2ea` | 로딩 스켈레톤 하이라이트 |

상태색(배지·바·칩이 공유하는 유일한 매핑):

| 상태 | 전경 | 배경 | 의미 |
|---|---|---|---|
| pending / due_soon | `--paper-pending` `#a3691c` | `--paper-pending-bg` `#f5e8ce` | 대기·임박 |
| in_progress | `--paper-review` `#3b6e78` | `--paper-review-bg` `#d5e4e6` | 진행 중 |
| approved / done | `--paper-done` `#5b7a4f` | `--paper-done-bg` `#dde5d3` | 완료 |
| rejected / overdue / due_now | `--paper-reject` `#94494b` | `--paper-reject-bg` `#edd6d7` | 반려·지연 |
| planned / scheduled / no_due | `--paper-planned` `#625c4e` | `--paper-planned-bg` `#ebe4d1` | 예정·기한 없음 |
| urgent | `--paper-urgent` `#a13a2a` | `--paper-urgent-bg` `#f4d9d1` | 긴급 표시(카운트·바) |

- 계층 `ink > text > dim > faint`를 유지한다. 값을 바꾸면 대비를 다시 계산한다.
- 색 잠금: 액센트는 세피아 하나. 상태색은 상태 의미로만 쓰고 장식으로 쓰지 않는다.

## 3. 타이포그래피 (Typography)

| 토큰 | 스택 | 용도 |
|---|---|---|
| `--font-sans` | Inter Variable + Noto Sans KR 폴백 | 본문·UI·**모든 숫자** |
| `--font-serif` / `--font-serif-display` | Newsreader Variable | 페이지 h1·섹션 h2·인용문에 한정 |
| `--font-mono` | JetBrains Mono Variable | ID·코드·시각(時刻) 등 기계값 |

- **숫자 규칙**: 데이터 숫자(카운트·KPI·순번·부하)는 산스 + `font-variant-numeric: tabular-nums`.
  세리프 이탤릭 숫자는 금지(브랜드 마크 'P'와 아바타 이니셜만 예외).
- **라벨 규칙**: UI 마이크로 라벨은 한국어, 최소 11px. 영문 대문자 트래킹 라벨은 쓰지 않는다.
  예외: 사이드바 브랜드 워드마크("SQA P1 / WORKFLOW") 한 곳만 허용 — 로고 록업이지 UI 라벨이 아니다.
  기계값(mono 숫자·시각·키캡)은 최소 10.5px.
- 크기 스케일: 10.5 / 11 / 12 / 12.5 / 13 / 13.5 / 14(본문) / 15 / 17 / 20 / 24 / 34px.

## 4. 간격·레이아웃 (Spacing)

- 간격 단위: base 1px 손튜닝 스케일. V2 Warm Paper는 4px 그리드가 아니라 광학 보정된 홀수 값(5·7·13 등)을
  의도적으로 쓴다. 4px 그리드 전환은 전면 리디자인 범위라 보류한다(ROADMAP '하지 않기로 한 것' 참조).
- 신규 코드의 권장 값: 2 / 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 24 / 26 / 32 / 44px.
  이 목록 밖 값을 쓰려면 인접 요소와의 광학 정렬 근거가 있어야 한다.
- 구조: `--sidebar-w: 220px`, `--topbar-h: 56px`, 콘텐츠 최대폭 1400px.
- **밀도 2모드**: 기본(comfortable)과 압축(compact). 압축은 `:root[data-density='compact']`에서
  `--stack-gap 26→16px`, `--row-pad-y 10→6px`, `--section-pad 24→16px`, 리스트 아이템 패딩 축소로만 구현한다.
  글자 크기는 밀도 모드로 줄이지 않는다.

## 5. 컴포넌트 (Components)

- 라운드 잠금: `--radius-sm 5 / md 8 / lg 12 / xl 16 / full`. 이 스케일 밖 라운드 금지.
  예외: 폭 3~4px 상태 바의 끝단 라운드(≤2px)와 컨페티 입자처럼 토큰보다 작은 장식 요소.
- 버튼: `.primary`(잉크 배경) / `.ghost`(패널) / `.danger`(reject). compact 변형 30px.
- 배지: `data-status` 기반, 상태색 매핑(§2)만 사용.
- 리스트 행: 좌측 3px 상태/긴급도 바(`::before`)가 시급도의 표준 문법.
- KPI 스탯: 라벨(한국어 11px, dim) + 값(산스 26px tabular-nums) + 단위(12px dim).
- 빈 상태: 아이콘(faint) + 본문 1줄 + (선택) 행동 버튼. 이탤릭 세리프 문구는 쓰지 않는다.
- 토스트: 우하단 고정, `--shadow-lg`, tone별 상태색. topbar에는 저장 중/동기화 라벨만 남긴다.
- 아이콘: lucide-react 단일 패밀리, stroke 1.8, 장식용 hand-rolled SVG 금지.

## 6. 모션 (Motion)

- `--dur-fast 150ms / --dur-normal 250ms`, `--ease-out / --ease-deep / --ease-spring`.
- transform·opacity·filter만 애니메이션. 레이아웃 속성 애니메이션 금지.
- hover 반응은 **클릭 가능한 요소에만** 허용.
- `prefers-reduced-motion: reduce`에서 모든 애니메이션 1ms로 축소(기존 규칙 유지).

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
- 포커스 표시는 `outline: 2px solid var(--paper-accent)` (비텍스트 대비 3:1 이상, 기존 규칙 유지).
