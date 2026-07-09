# 아키텍처 개요

SQA P1 Workflow의 현행 구조와 유지보수 규칙. 코드가 곧 사실이며, 이 문서는 "어디를 어떻게 고치는가"의 지도다.

## 시스템 한 줄 요약

10인 SQA 파트의 업무 배정·검토요청·프로젝트 현황을 관리하는 SPA.
React 18 + TypeScript + Vite, 백엔드는 Supabase(Postgres + Auth + Storage, RLS가 권한의 원천),
배포는 Cloudflare Workers 정적 자산. 라우팅은 URL 해시(`#/reviews?id=...`) 기반.

## 소스 구조

```
src/
├─ main.tsx / App.tsx        진입점. App은 인증·데이터·내비 훅을 조립하고 화면을 분기한다
├─ app/                      앱 셸 계층
│  ├─ AppRoutes.tsx          탭 → 화면 매핑 (역할 가드 포함)
│  ├─ hooks/                 useAppData(세대 토큰 refresh) · useAuthProfile(부트스트랩)
│  │                         · useMutationRunner(재진입 가드) · useHashNavigation · usePreviewRoleChange
│  │                         · useBackgroundRefresh(5분 폴링+창 복귀) · useRealtimeReviewInserts(INSERT 구독)
│  │                         · useDesktopNotifications(파트장 OS 알림 — 실패는 조용히 무시)
│  ├─ types.ts               UI 계층 타입 (TabId 재수출, MutateFn, ToastMessage …)
│  └─ constants.ts           emptyData, deleteWarnings
├─ data/                     데이터 접근 계층 (UI는 여기의 함수만 호출)
│  ├─ index.ts               공개 API (mutations 재수출)
│  ├─ fetchAppData.ts        전체 AppData 로드 (원격)
│  ├─ repositoryContext.ts   createRepositoryContext → { profile, data, setData, isRemote }
│  ├─ repositories/types.ts  Review/Project/Master Repository 인터페이스 + RepositoryDeps
│  ├─ local/                 데모(preview) 구현 — appDataReducers 순수 리듀서 사용
│  ├─ remote/                Supabase 구현 — 위험한 쓰기는 전부 RPC (원자성·권한은 DB가 보장)
│  └─ mutations/             도메인별 뮤테이션 진입점. reviews/projects는 repository에 위임,
│                            master는 일부 인라인 분기 잔존(ROADMAP Phase 3-4에서 위임 예정)
├─ features/                 기능 단위 (화면 컴포넌트·셀렉터·검증기·훅)
│  ├─ master/                기준 구조 — products/duties/invites 하위 폴더 + shared/
│  ├─ reviews/               selectors·validators·useReviewDraft·useReviewSelection
│  │                         + components/ (List·Kanban·Detail·RequestItem·ComposerModal)
│  ├─ projects/              selectors + components/ (Board·Card·ComposerModal·AssignmentEditModal)
│  └─ dashboard/             prioritySelectors — 파트장 홈 우선순위 큐 (순수 함수, 테스트됨)
├─ screens/                  탭 단위 화면. 상태·뮤테이션 배선을 소유하고 표현은 features에 위임
├─ components/               공용 컴포넌트 (ui/ 프리미티브, CommandPalette, NotificationPanel, ErrorBoundary)
├─ domain/permissions.ts     RLS 정책의 클라이언트 거울 (실행 가능한 문서 — 테스트로 고정)
├─ hooks/                    공용 훅 (useTeamSummaries, useModalDismiss)
├─ lib/                      순수 유틸 (dates·format·priority·csv·errors·attachments·notifications
│                            ·desktopNotifications·clipboard·navigation·readState …)
├─ demo/ + demoData.ts       익명 데모 데이터 (preview 모드) — noPrivateSeedInSrc.test.ts가 익명성 강제
├─ types/ + types.ts         도메인 타입 배럴 (domain.ts + view.ts)
└─ security/                 회귀 가드 테스트 (사설 데이터 유입 금지)
```

## 계층 규칙

- **의존 방향**: screens → features → lib/domain/types. features가 screens를 임포트하지 않는다.
- **데이터 접근**: 화면은 `src/data`의 함수만 호출한다. Supabase 클라이언트를 화면에서 직접 만지지 않는다.
- **local/remote 등가성**: 데모(local)와 원격(remote)은 같은 Repository 인터페이스를 구현하고,
  검증 규칙(RLS 등가 가드)도 동일하게 동작해야 한다. 한쪽만 고치면 데모로 확인한 동작과 실서비스가 어긋난다.
- **단일 기준 함수**: 마감 긴급도는 `lib/dates.ts`의 `dueUrgency`, 검토 정렬은 `lib/priority.ts`,
  미확인 판정은 `lib/readState.ts`의 `isReviewUnread` — 화면마다 재구현하지 않는다.
- **탭 목록의 원천**: `lib/navigation.ts`의 `APP_TABS`/`TabId`. `app/types.ts`가 재수출한다.

## 권한 모델

- 역할은 `leader`(파트장) / `member`(파트원) 둘뿐. 진짜 권한은 **Supabase RLS**가 강제하고,
  클라이언트의 `domain/permissions.ts`는 그 거울이다(UI 표시용). RLS 정책을 바꾸면 둘 다 바꾼다.
- `must_change_password=true`·`is_active=false`는 RLS 레벨에서 데이터 접근이 차단된다.
- 위험한 쓰기(상태 전이, 배정 교체, 프로젝트 생성)는 SECURITY DEFINER RPC로만 수행한다.

## DB·마이그레이션

- `supabase/migrations/`는 **append-only 불변 이력** — 절대 수정·병합하지 않는다.
  규칙과 적용 절차는 [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md).
- `src/migrations.test.ts`가 마이그레이션 텍스트를 회귀 고정한다. 새 마이그레이션 추가 시 함께 갱신.

## 실행 모드

| 모드 | Supabase env | 동작 |
|---|---|---|
| production / development | 필수 | 실 데이터. 누락 시 설정 오류 화면 |
| preview | 비움 | 데모 데이터(src/demoData.ts), 로그인 없이 UI 확인. 역할 전환 토글 제공 |

## 테스트 지도

| 대상 | 위치 | 비고 |
|---|---|---|
| 순수 로직 (dates·priority·stats·csv·errors…) | `src/lib/*.test.ts` | |
| 셀렉터·검증기 | `src/features/**/**.test.ts` | 우선순위 큐 포함 |
| 데이터 계층 (mutations·reducers) | `src/data/**/*.test.ts` | 데모/원격 가드 등가성 |
| 화면 렌더 | `src/screens/ReviewsPanel.test.tsx` | 다른 대형 화면은 ROADMAP Phase 3 |
| 마이그레이션·스크립트 회귀 | `src/migrations.test.ts`, `src/scripts.test.ts` | |
| 보안 가드 | `src/security/noPrivateSeedInSrc.test.ts` | 사설 데이터 유입 금지 |
| RLS 자동 테스트 | `tests/rls/` | 로컬 Supabase에서만 실행(env 게이트), 아니면 skip |

## 디자인

토큰 계약은 [DESIGN.md](../DESIGN.md) — 색·크기·간격·라운드·그림자는 토큰으로만.
`src/styles.css`가 유일한 스타일 파일이며 섹션 주석으로 구획한다.

## 알려진 부채 (의도적 보류)

- `data/mutations/master.ts`의 add/update/import 경로에 `ctx.isRemote` 인라인 분기가 남아 있다 —
  repository 위임으로 통일하는 작업은 [ROADMAP.md](./ROADMAP.md) Phase 3-4.
- Shell 사이드바·CommandPalette의 탭 라벨 목록이 각자 유지된다(추가 시 두 곳 동기화 필요).
- 대형 화면(Projects·Master·Team) 컴포넌트 테스트 부재 — ROADMAP Phase 3-2·3-3.
