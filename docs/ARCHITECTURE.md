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

`RepositorySet`은 review, announcement, project, team, change application, product admin, duty admin, invite admin, activity log writer를 제공한다. Product/Duty/Invite는 독립 interface와 독립 adapter object다. `src/data/mutations/master.ts`는 기존 import를 위한 re-export만 유지한다.

AppData 조회는 `coreQueries`, `reviewQueries`, `changeQueries`, `optionalQueries`, `auditQueries`로 나뉜다. optional 결과는 위치 기반 배열이 아닌 이름 있는 객체이며, 부분 실패 시 직전 정상 snapshot과 warning을 유지한다.

## 화면 구조

- Change Applications, Reviews, Projects, Team, Product/Duty/Invite Master, Announcements, Activity는 controller hook과 presentation이 분리되어 있다.
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
- 브라우저 계약: Playwright preview 10개 시나리오
- DB 권한: pinned Supabase CLI + Docker의 full RLS gate
- 산출물: production build + bundle budget + security header render

세부 실행 순서는 [TEST_PLAN.md](./TEST_PLAN.md), 운영 차단 조건은 [OPERATIONS.md](./OPERATIONS.md)를 따른다.
