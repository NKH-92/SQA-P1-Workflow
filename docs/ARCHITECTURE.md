# 아키텍처

이 문서는 현재 코드의 유지보수 경계를 설명한다. 기능·UI 문구·DOM/ARIA·해시 경로·권한·RPC 인자는 호환 계약이며, 구조 변경만으로 바꾸지 않는다.

## 런타임 구조

SQA P1 Workflow는 React 18 + TypeScript + Vite SPA다. Supabase Auth/Postgres/RLS가 인증과 영속 권한을 담당하고 Cloudflare Worker가 정적 자산을 제공한다. URL은 `#/reviews?id=...` 형식의 해시 경로를 사용한다.

```text
App / app hooks
  -> screens (화면 조립과 presentation)
    -> features (controller hooks, selectors, feature components)
      -> data public API
        -> RepositorySet composition root
          -> local adapters | Supabase adapters
domain (순수 전이/권한/공유 도메인 모델)
lib (저수준 순수 유틸리티)
```

## 계층별 책임

- `src/domain`: React와 DB에 의존하지 않는 권한, 변경신청 상태 전이, 활동 로그 fact, 변경업무 context를 소유한다. 상태 전이는 actor, 시각, ID를 입력으로 받고 `{ data, logFacts }`를 반환한다.
- `src/data`: 계약, 조회 pipeline, repository interface, local/remote adapter, mutation orchestration을 소유한다. UI 상태 setter는 React 타입이 아닌 `AppDataUpdater` 계약으로 받는다.
- `src/data/repositories/createRepositorySet.ts`: local/remote 선택의 유일한 composition root다. `RepositoryContext`의 `mode`, `capabilities`, `repositories`는 필수다.
- `src/features`: 화면별 controller hook, selector, validator, presentation component를 소유한다. controller가 mutation facade와 repository context를 사용하고 presentation은 adapter를 직접 선택하지 않는다.
- `src/screens`: feature를 조립하고 화면 상태를 표시한다. DB adapter나 mutation 구현을 직접 import하지 않는다. 공지 정렬처럼 읽기 전용 collection selector는 허용한다.
- `src/app`: 인증, refresh, hash navigation, desktop notification, command palette 단축키, mutation runner를 조립한다.
- `src/lib`: 날짜, 표시, CSV, 오류, 알림 등 저수준 유틸리티다. DB write를 두지 않는다.

Supabase Auth 자체를 다루는 `AuthPanel`과 `PasswordChangePanel`은 repository 대상 업무 데이터가 아니므로 인증 client를 직접 사용한다.

## Repository 계약

`RepositorySet`은 review, announcement, project, team, change application, product admin, duty admin, invite admin, activity log writer를 제공한다. Product/Duty/Invite는 local과 Supabase 양쪽에서 각각 독립 interface와 실제 adapter 구현을 가진다. `localMasterRepository.ts`와 `supabaseMasterRepository.ts`는 기존 import를 위한 합성 facade만 유지하며, `src/data/mutations/master.ts`도 호환 re-export만 제공한다.

AppData 조회는 `coreQueries`, `reviewQueries`, `changeQueries`, `optionalQueries`, `auditQueries`로 나뉜다. optional 결과는 위치 기반 배열이 아닌 이름 있는 객체이며, 부분 실패 시 직전 정상 snapshot과 warning을 유지한다.

## Bootstrap snapshot 계약

`coreQueries`/`reviewQueries`/`changeQueries`는 각각 `get_core_bootstrap_v2`, `get_review_bootstrap_v2`, `get_change_bootstrap_v2` RPC 하나만 호출한다. 각 RPC는 여러 PL/pgSQL statement를 이어 붙이지 않고 하나의 `RETURN (SELECT …)` statement에서 결과를 조립한다. 따라서 RPC별 결과는 PostgreSQL의 단일 statement snapshot을 공유한다. review envelope은 최상위 필드가 `data`로 감싸이지 않고 평탄화되어 있다.

```ts
type BootstrapEnvelope<T> = {
  schema_version: number
  snapshot_at: string   // DB clock_timestamp() — 이 스냅샷이 실제로 유효한 시각
  data: T
  warnings: string[]    // bounded collection overflow 등 partial-success를 사용자에게 알림
}
```

**허용되는 skew(불일치) 경계**: 세 bootstrap은 **서로 다른 transaction**이며 병렬로 호출된다. 각 bootstrap **내부**는 항상 일관되지만(같은 snapshot에서 조인됨), 세 bootstrap **사이**에는 한 번의 `fetchAppData()` 호출 동안 커밋된 변경이 어느 한쪽에만 반영되고 다른 쪽에는 반영되지 않을 수 있다. 예:

- 어떤 제품이 change bootstrap이 열리기 직전에 재배정되면, 같은 refresh의 core bootstrap은 새 배정을 아직 보여주지 않을 수 있다. 다음 refresh(5분 polling 또는 수동 refresh)에서 반드시 수렴한다.
- 이 skew는 항상 "가장 최근 커밋을 놓칠 수 있다" 방향으로만 발생한다 — 이미 존재하지 않는 데이터를 보여주는 방향으로는 발생하지 않는다(각 bootstrap이 자기 SELECT 시점 이전에 커밋된 것만 본다).
- `fetchAppData()`가 노출하는 `snapshotAt`은 세 `snapshot_at` 중 **가장 이른 시각**이다 — "이 시각 기준으로는 확실히 최신"이라는 가장 보수적인 주장만 하기 위함이며, `useAppData`의 `lastSyncedAt`이 이 값을 그대로 사용한다.
- 이 skew를 없애려면 세 도메인을 하나의 RPC/transaction으로 합쳐야 하는데, 그러면 한 도메인의 optional 실패가 다른 모든 도메인의 초기 로드를 막게 되므로(D-05와 상충하지 않지만 가용성을 낮춤) 채택하지 않았다. 세 bootstrap을 독립 RPC로 유지하는 것이 의도된 절충이다.

세 bootstrap 중 하나라도 에러거나 응답이 `null`이면 `fetchAppData()`는 fail-closed로 throw한다(기존 required-query 실패 의미 보존). `schema_version`이 기대값과 다르면 알려지지 않은 형태를 읽지 않고 즉시 실패한다. core schema v2의 `leader_profiles`는 현재 active leader ID의 authoritative required snapshot이다. 파트장 이름 optional 조회가 실패하면 직전 이름 snapshot을 이 ID 집합으로 제한하므로 강등·비활성화된 파트장을 되살리지 않는다. 공지·초대·메모·활동 로그는 기존 partial-failure/직전 snapshot 유지 정책을 따른다.

## 검토 통계 계약

`get_review_statistics_v2`는 선택한 KST 영업일 범위 안에 생성된 현재 요청과 같은 범위의 검토 이벤트를 집계한다. `pending_count`도 동일한 요청 생성일 범위를 사용하며, 전체 기간 말일의 미처리 재고는 별도 `month_end_backlog`로 유지한다. 응답의 `requester_breakdown`은 현재 요청자와 기간 내 이벤트 요청자의 합집합을 담고, UI의 전체 KPI는 이 요청자별 행 합계와 항상 일치한다. `monthly_breakdown`까지 한 RPC의 마지막 statement에서 set-based로 조립하므로 화면 전체가 같은 snapshot을 공유하며 10만 이벤트 fixture에서도 월 수만큼 통계 함수를 반복하지 않는다. 필수 필드의 타입·날짜·count가 하나라도 잘못된 응답은 구형·불완전 schema로 보고 fail-closed 처리한다.

검토 이벤트 cursor는 PostgreSQL `bigint`를 JavaScript `number`로 축소하지 않는다. `list_review_events_page_v2(uuid,text,integer)`가 decimal string을 검증한 뒤 내부에서만 `bigint`로 변환하고, client와 read receipt는 ID를 문자열로 보존하여 `Number.MAX_SAFE_INTEGER`보다 큰 인접 ID도 정확히 정렬·비교한다.

## 화면 구조

- 화면은 feature controller·selector·표현 컴포넌트를 조립한다. 큰 화면의 조정 상태는 회귀 계약을 고정한 뒤 단계적으로 controller로 옮긴다.
- Review Stats의 서버 V2 로딩·필터 상태는 화면이 소유하고, 차트·상태 분포·정확한 수치표는 `ReviewStatsVisuals.tsx`에 있다.
- Product/Duty/Invite Master는 각 controller와 repository가 책임별로 분리되어 있다.
- CommandPalette는 `commandPaletteModel.ts`의 순수 결과 모델과 UI keyboard controller로 분리된다.
- Shell의 파생 count는 `shellModel.ts`, 밀도 저장은 `useDensityPreference.ts`에 있다.
- feature 입력은 전체 AppData 대신 필요한 `Pick<AppData, ...>` 계약을 우선한다.

## 강제되는 경계

`npm run lint`는 ESLint 뒤에 `scripts/check-dependency-boundaries.mjs`를 실행한다. 이 검사는 import 문자열의 `../` 개수가 아니라 해석된 실제 경로를 사용한다.

- domain -> data/features/screens 금지
- data -> features/screens 금지
- features -> screens 금지
- lib -> data/features/screens 금지
- presentation -> data mutation/local/remote adapter 직접 import 금지
- repository contract -> React import 금지

`scripts/fixtures/dependency-boundaries`의 깊은 상대경로 위반 fixture가 실패하는지 unit test로 고정한다.

## 단일 원천

- 빈 AppData: `src/data/appData.ts`
- 공지 정렬: `src/data/announcementCollection.ts`
- repository 선택: `src/data/repositories/createRepositorySet.ts`
- RLS 실행: `scripts/run-local-rls-gate.mjs`
- readiness SQL 목록과 migration version: `scripts/sql/verify/manifest.json`
- 역할별 navigation metadata: `src/lib/navigation.ts`

## 데이터베이스 불변조건

`supabase/migrations`의 기존 파일은 append-only 이력이다. 수정, 삭제, rename하지 않는다. schema 변경은 새 migration으로만 추가하고 manifest/migration contract/RLS fixture를 함께 갱신한다. 공개 mutation은 RLS와 RPC 권한을 우회하지 않는다.

## 검증 지도

- 정적: typecheck, ESLint, dependency boundary checker
- 도메인/데이터/UI: Vitest
- 브라우저 계약: Playwright preview 12개 + 실제 local Supabase remote 12개 시나리오
- DB 권한: pinned Supabase CLI + Docker의 full RLS gate
- 산출물: production build + bundle budget + security header render

세부 실행 순서는 [TEST_PLAN.md](./TEST_PLAN.md), 운영 차단 조건은 [OPERATIONS.md](./OPERATIONS.md)를 따른다.
