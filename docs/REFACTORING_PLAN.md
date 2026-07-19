# SQA P1 Workflow 유지보수 리팩토링 계획

> 이 문서는 2026-07-17 실행 기록으로 보존합니다. 현재 교정 리팩토링의 authoritative plan은
> [`docs/refactoring/MASTER_PLAN_2026-07-19.md`](refactoring/MASTER_PLAN_2026-07-19.md)입니다.

> 상태: 실행 전 계획
> 기준일: 2026-07-17
> 작성 근거: 저장소 정적 점검, 현재 테스트/빌드 기준선, GPT-5.6 Sol Pro(Web AI) 검토
> 최우선 원칙: 기능, 화면 구성, 권한, 데이터 의미, 외부 계약을 바꾸지 않는다.

## 1. 목적

이 계획은 새 기능을 추가하거나 제품 동작을 개선하는 계획이 아니다. 현재 동작을 먼저 테스트로 고정한 뒤, 의존 방향과 파일 책임을 작은 단위로 정리해 이후 수정의 영향 범위와 회귀 위험을 낮추는 계획이다.

기존 `docs/IMPROVEMENT_PLAN.md`는 기능·보안·운영 개선 계획으로 유지한다. 이 문서는 관찰 가능한 동작을 바꾸지 않는 내부 구조 개선만 다룬다.

## 2. 불변 계약

### 2.1 반드시 그대로 유지할 항목

- 사용자 기능, 업무 절차, 화면 전환, 탭 순서와 이름
- 현재 DOM 의미, 접근성 이름, 키보드 동작, 모달과 포커스 동작
- 화면 배치, 반응형 분기, 색상·간격·타이포그래피·애니메이션을 포함한 시각 구성
- 역할별 노출, 권한 판정, 승인·게시·재개·이관 규칙
- 로컬 모드와 Supabase 원격 모드의 결과 및 오류 의미
- repository 공개 인터페이스, mutation 공개 함수, 기존 import 진입점
- RPC 이름, 인자, 호출 순서, 쿼리 필터·정렬·상한, 오류·경고 처리 순서
- 데이터 모델, Supabase 스키마, RLS 정책과 마이그레이션 이력
- URL 해시, 딥링크 해석, 읽음 상태, 알림 동작
- 패키지, 빌드 설정, 환경 변수, 배포 구성

### 2.2 허용할 내부 변경

- 동일한 공개 export를 유지하는 파일 분리와 재-export
- 순수 함수, 전용 훅, 표현 전용 컴포넌트 추출
- feature를 역참조하는 하위 계층 타입·검증기의 중립 계층 이동
- 동일 순서와 동일 결과를 보장하는 repository 위임 정리
- 테스트 가능성을 높이기 위한 의존성 주입 경계 정리

### 2.3 이번 계획에서 제외할 변경

- 새 상태관리, 라우터, ORM, 쿼리 캐시 또는 UI 라이브러리 도입
- 의존성 버전 변경, 빌드·린트·TypeScript 설정 변경
- DB 스키마, RPC, RLS, 기존 마이그레이션 수정 또는 합치기
- 사용자 문구, 오류 문구, 권한 규칙, 기능 플로우 변경
- 전역 이름 변경, 일괄 포맷, 전체 import 경로 교체
- 성능 최적화와 구조 변경을 한 PR에 함께 포함하는 작업
- 테스트 기대값을 새 구현에 맞춰 바꾸는 방식의 회귀 은폐

### 2.4 핵심 불변 검증 표

| 영역 | 고정할 현재 의미 | 주 검증 |
|---|---|---|
| App gate | loading → config → blocked/profile error/auth → inactive → password change → main shell 순서 | 상태별 렌더 contract |
| Hash/role | tab ID·query 형식, invalid/unauthorized tab의 dashboard 정규화 | leader/member truth table |
| DOM/접근성 | 태그·부모자식 순서, className, role/name, focus, keyboard, 버튼 순서 | DOM/ARIA + 수동 키보드 |
| Fetch core | 14개 query를 기존 순서의 `Promise.all`, 첫 오류로 전체 실패 | Supabase trace |
| Fetch optional | core 성공 뒤 5개 `Promise.allSettled`, 영역별 동일 warning/fallback | 위치별 실패 test |
| 데이터 범위 | pending 포함, 종결/이력의 6개월 cutoff, 기존 sort/limit/merge | fake clock + 배열 equality |
| Mutation | table/RPC, 인자 key, null, early return, affected-row 검증 | operation trace |
| Activity log | 본체와 로그의 선후관계, remote best-effort, local 40개 제한 | 순서 trace |
| Local/remote | 현재 검증 강도, 오류 우선순위, 상태전이와 no-op | 같은 fixture의 contract 비교 |
| Attachment | 입력 검증 → upload → record 저장 → 실패 시 새 파일만 제거 | call-order test |
| Timer/confirm | 기존 confirm 문구, 1,400ms celebration, 2,600ms notice | fake timer + confirm mock |
| 구성 | dependency, lockfile, Vite/Vitest/ESLint/TS/CI/deploy/bundle budget 무변경 | checkpoint diff 0 |

## 3. 검증된 현재 기준선

### 3.1 저장소 상태

- 기준 브랜치: `main`
- 기준 커밋: `e4ce77a` (`origin/main`과 동일)
- 현재 작업 트리에는 변경 신청 기능과 관련된 사용자 작업이 존재한다.
  - 추적 파일 44개 수정
  - 미추적 파일 15개
  - 대략 `+1,886 / -23`
- 따라서 리팩토링 시작 전에 현재 기능 작업을 별도 체크포인트로 완결해야 한다. 이 변경과 리팩토링을 같은 커밋이나 PR에 섞지 않는다.

### 3.2 품질 기준선

2026-07-17 로컬 점검 결과:

| 게이트 | 결과 |
|---|---|
| `npm run typecheck` | 통과 |
| `npm run lint` | 통과 |
| `npm test -- --reporter=dot` | 75개 파일 통과, 6개 건너뜀; 376개 테스트 통과, 38개 건너뜀 |
| `npm run build` | 통과 |
| 번들 예산 | 통과, gzip 합계 171,398 bytes |
| `npm run test:rls` | 로컬 Docker와 Supabase CLI 부재로 미실행 |

RLS 테스트 미실행은 성공으로 간주하지 않는다. 데이터 계층이나 권한 관련 PR은 GitHub Actions의 RLS 작업 통과가 병합 필수 조건이다.

### 3.3 구조 지표

- TypeScript/TSX 208개: 제품 코드 133개, 테스트 75개
- 제품 TypeScript 약 16,943줄
- 확인된 import cycle: 0개
- `src/types.ts`로 향하는 import가 115개로 가장 많지만, 현재 공개 타입 진입점이라는 사실만으로 분해 대상이라고 판단하지 않는다.
- 대형 파일과 책임 집중 지점:

| 대상 | 관찰 결과 | 주된 위험 |
|---|---:|---|
| `src/data/mutations/master.ts` | 약 668줄, 함수 78개, 분기 77개 | 공개 mutation과 로컬/원격 저장 방식 결합 |
| `src/data/local/appDataReducers.ts` | 약 570줄 | 여러 도메인의 상태 변경 로직 집중 |
| `src/screens/ReviewStatsPanel.tsx` | 약 569줄 | 조회·필터·표현 책임 결합 |
| `src/screens/ChangeApplicationsPanel.tsx` | 약 532줄 | 권한·선택·모달·표현 책임 결합 |
| `src/demoData.ts` | 약 516줄 | 대형 fixture 생성 경로 |
| `src/screens/AnnouncementsPanel.tsx` | 약 478줄 | 상태·액션·표현 결합 |
| `src/data/local/localChangeApplicationRepository.ts` | 약 461줄 | 복합 원자성 규칙과 로컬 상태 변경 결합 |
| `src/features/reviews/components/ReviewRequestItem.tsx` | 약 444줄 | 항목별 상태와 액션 분기 집중 |
| `src/screens/ProjectsPanel.tsx` | 약 436줄 | 화면 조립과 업무 액션 결합 |
| `src/features/reviews/reviewStats.selectors.ts` | 약 415줄 | 통계 계산 책임 집중 |
| `src/screens/ReviewsPanel.tsx` | 약 373줄 | 화면 조립과 검토 흐름 결합 |
| `src/App.tsx` | 약 351줄 | 인증·데이터·탐색·딥링크·읽음 상태 조율 |
| `src/data/fetchAppData.ts` | 약 343줄 | 핵심/선택 데이터 로딩과 결과 조립 결합 |
| `src/screens/Shell.tsx` | 약 336줄 | 탐색 메타데이터와 셸 표현 결합 |
| `src/styles.css` | 6,342줄 | 전역 캐스케이드와 반응형 규칙 회귀 위험 |

파일 크기는 우선순위 신호일 뿐이다. 분리 여부는 변경 빈도, 책임 수, 테스트 가능성, 의존 방향과 회귀 위험을 함께 보고 결정한다.

### 3.4 Web AI 검토 기록

- 제공자: ChatGPT Web AI
- 검증된 선택: `GPT-5.6 Sol` / `Pro`
- 세션: `01KXQHBQW8GGNMWB227Y11QYN9`
- 대화: `https://chatgpt.com/c/6a59e0bf-7470-83ee-8952-d14c555d3ff6`
- 입력: 제품 코드와 핵심 구성 67개 파일, 약 120,337 estimated tokens
- 처리 방식: Web AI 진단을 로컬 import·파일·테스트·빌드·작업 트리 결과와 교차 확인해 채택, 제한적 채택, 보류로 판정

Web AI의 제안도 저장소 사실보다 우선하지 않는다. 코드나 테스트에서 확인되지 않는 제안은 구현 작업으로 승격하지 않는다.

## 4. 핵심 코드리뷰 결과

### P0 — 리팩토링 전에 현재 기능 변경을 고정해야 함

현재 작업 트리의 변경 신청 기능은 화면, local/remote repository, mutation, migration, RLS 테스트를 동시에 포함한다. 이 상태에서 구조 변경을 시작하면 기능 구현과 리팩토링의 원인을 분리할 수 없다.

판정: 즉시 채택. 모든 리팩토링의 선행 조건이다.

### P1 — 하위 데이터 계층이 feature 계층 타입과 검증기에 의존함

확인된 예:

- `src/data/repositories/types.ts`가 local reducer payload와 feature 전용 타입을 참조
- local/remote review repository가 `src/features/reviews/review.validators.ts`를 참조
- 변경 신청 data 계층이 `src/features/change-applications`의 타입·selector·validator를 참조

UI feature가 repository를 사용하는 방향은 자연스럽지만 repository가 UI feature를 역참조하면 기능 폴더 이동이 데이터 계층까지 전파된다.

판정: 채택. 타입과 순수 검증기만 중립 계약 계층으로 이동하고 기존 위치는 재-export로 보존한다.

### P1 — master mutation이 orchestration과 persistence 선택을 함께 담당함

`src/data/mutations/master.ts`의 일부 함수가 `ctx.isRemote`를 직접 검사해 local/remote 경로를 선택하고, 삭제 계열은 repository에 위임한다. 공개 함수의 역할과 저장 방식 선택 책임이 일관되지 않다.

판정: 채택. mutation facade는 검증·감사 로그·업무 순서만 담당하고 저장 방식은 repository 구현이 담당하게 한다. 공개 함수 시그니처와 호출 순서는 유지한다.

### P1 — 대형 reducer 모듈이 변경 충돌 범위를 넓힘

`src/data/local/appDataReducers.ts`에 여러 도메인의 payload와 reducer가 모여 있다. 단, 함수 자체가 순수하고 테스트가 있으므로 로직 재작성보다 기계적 이동이 안전하다.

판정: 채택. 도메인별 파일로 원문을 이동하고 기존 파일은 barrel로 유지한다. 같은 PR에서 알고리즘을 정리하지 않는다.

### P2 — 앱 조립부에 독립적으로 검증 가능한 효과가 섞여 있음

`src/App.tsx`는 인증과 앱 데이터 소유 외에도 딥링크 대상 해석, 검토 읽음 추적, 키보드 단축키를 조율한다.

판정: 부분 채택. 세 효과를 전용 훅으로 추출하되 인증·데이터 소유권과 세대 토큰 동작은 `App`에 남긴다.

### P2 — 탐색 ID는 중앙화됐지만 표시 메타데이터가 중복됨

탭 ID는 `src/lib/navigation.ts`가 제공하지만 `src/screens/Shell.tsx`와 `src/components/CommandPalette.tsx`가 표시 이름과 순서를 따로 유지한다.

판정: 부분 채택. ID·이름·순서·역할 메타데이터만 한 곳에 모은다. `src/app/AppRoutes.tsx`의 명시적 JSX와 화면별 이질적인 props는 그대로 둔다.

### P2 — 대형 화면은 상태·권한·표현 책임을 함께 가짐

특히 `ChangeApplicationsPanel`, `ProjectsPanel`, `ReviewsPanel`, `ReviewRequestItem`, `Shell`은 한 변경이 넓은 컴포넌트 본문을 건드리게 한다.

판정: 단계적 채택. 먼저 특성화 테스트, 다음 순수 view model, 마지막 표현 컴포넌트 순으로 나눈다. 여러 화면을 한 PR에서 동시에 분리하지 않는다.

### P2 — 데이터 로더의 실패 의미가 중요한 숨은 계약임

`src/data/fetchAppData.ts`는 14개 핵심 쿼리를 `Promise.all`로 처리하고, 5개 선택 데이터를 `Promise.allSettled`로 처리한다. 핵심 실패는 전체 실패이고 선택 실패는 경고와 fallback이다.

판정: 제한적 채택. 쿼리 실행 구조는 유지하고 순수 결과 조립과 오류 변환만 추출한다. 도메인별 비동기 로더 분할은 await·실패·쿼리 순서를 바꿀 위험이 있어 보류한다.

### P3 — CSS 파일 분리는 현재 바로 시행하기에 위험함

`src/styles.css`가 매우 크지만 import 위치와 규칙 순서가 캐스케이드 결과를 바꿀 수 있다. 문서의 “단일 스타일 파일” 설명도 실제 전용 CSS 파일 존재와 일치하지 않는다.

판정: 현재 거절. 실제 selector, cascade, import 순서에 대한 별도 근거와 시각 비교 기반이 없는 상태에서는 실행하지 않는다. 근거를 갖춘 새 요청이 생기면 이번 계획과 분리해 다시 판단한다.

### P3 — `src/types.ts`의 높은 중심성은 즉시 결함이 아님

판정: 대규모 분할 보류. 새 순환 의존이나 지속적 충돌이 실제로 확인될 때만 내부 도메인 파일을 만들고 `src/types.ts`의 공개 export는 유지한다.

### 보류 — generic I/O adapter와 DI 계층

announcement, review, project, change application은 이미 local/remote repository 경계를 사용한다. auth, realtime, storage, fetch도 서로 다른 lifecycle의 전용 경계다.

판정: master 경계만 정리하고 전역 `SupabaseGateway`, generic `Repository<T>`, DI container, activity-log adapter는 도입하지 않는다. 공통화가 operation별 RPC·오류·로그 순서를 숨길 가능성이 더 크다.

### 보류 — `createPreviewData` 분해

`src/demoData.ts`와 `createPreviewData`의 크기만으로는 preview/local과 remote의 등가성을 해치지 않는 안전한 분할 경계를 결정할 수 없다.

판정: 현재 거절. fixture 관계와 생성 순서에 대한 별도 characterization 근거가 마련되기 전에는 이동하지 않는다.

## 5. 목표 의존 방향

```text
screens / components
        ↓
feature hooks / selectors / view models + app orchestration
        ↓
data public API / operation contracts
        ↓
repository interfaces
        ↓
local adapters | Supabase adapters
```

규칙:

- 아래 계층은 위 계층을 import하지 않는다.
- `src/types.ts`와 기존 feature 타입 파일은 호환용 공개 barrel이 될 수 있다.
- 화면 컴포넌트는 local/remote 선택을 알지 않는다.
- mutation facade는 업무 순서를 알고, repository 구현은 저장 방식을 안다.
- adapter는 React 화면, feature selector, 화면 전용 타입을 import하지 않는다.

## 6. 실행 계획

각 작업 패키지는 원칙적으로 하나의 독립 PR이다. 한 PR이 아래 두 패키지를 동시에 수행하지 않는다. RF 번호는 주제 식별자이며 실제 실행 순서는 7절을 따른다.

### RF-00 — 현재 변경 신청 기능 체크포인트

목표: 리팩토링 기준이 될 기능 상태를 먼저 확정한다.

작업:

1. 현재 변경 파일을 기능 PR로만 정리한다.
2. migration은 append-only 원칙을 유지하고 기존 SQL을 수정하거나 합치지 않는다.
3. 변경 신청의 local/remote 동등 동작과 역할별 권한을 검증한다.
4. 기능 PR이 병합되고 `main`과 CI가 녹색인 커밋을 새 기준선으로 기록한다.
5. checkpoint SHA/tag, migration checksum, 테스트 수, bundle/chunk 결과와 주요 역할·viewport screenshot을 보존한다.
6. 기준선 기록 시 작업 트리가 clean인지 확인한다.

필수 검증:

- 공통 네 게이트
- `npm run test:rls` GitHub Actions 통과
- 리더/일반 구성원별 목록, 등록, 게시, 완료, 재개, 이관 흐름
- 직접 쓰기 차단과 비활성 구성원 차단

중단 조건: 기능 요구나 DB 정책이 아직 바뀌는 중이면 리팩토링을 시작하지 않는다.

### RF-01 — 특성화 테스트 보강

목표: 현재 구현이 아니라 현재 관찰 동작을 고정한다.

추가 대상:

- `ChangeApplicationsPanel`: 필터 조합, 딥링크 선택, 모든 모달 액션, 이력 병합, 역할별 버튼 노출
- `App`: 딥링크 성공/실패, 읽음 처리 시점, 키보드 단축키 등록·정리
- `Shell`/`CommandPalette`: 탭 이름·순서·역할별 노출 동등성
- `master.ts`: local/remote별 validation, repository 호출, 감사 로그, 오류 순서
- `appDataReducers.ts`: 도메인별 불변성, 원자성, 입력 객체 비변형
- `fetchAppData.ts`: 핵심 실패, 선택 실패, 경고 수집, 정렬·상한, profile merge

원칙:

- 구현 내부 호출만 고정하는 테스트보다 사용자 관찰값과 공개 계약을 우선한다.
- 의도하지 않은 현재 버그를 테스트로 영구 고정하지 않는다. 의심 항목은 별도 이슈로 격리하고 이번 리팩토링에서는 동작을 바꾸지 않는다.
- 이 PR에는 제품 코드 이동을 포함하지 않는다.

### RF-02 — 중립 계약과 순수 검증기 추출

목표: data → feature 역방향 import를 제거한다.

신규 경계:

- `src/data/contracts.ts`
  - `AnnouncementPayload`
  - `ReviewRequestPayload`
  - `ProjectInput`
  - `ChangeTaskDraft`
  - `ChangeApplicationInput`
- `src/data/validation/reviews.ts`
  - active leader/member, attachment, review 상태전이, reject/reopen/resubmit, feedback 검증
- `src/data/validation/changeApplications.ts`
  - application 입력, task reason/note, task 배열 정규화
- `src/data/selectors/changeTaskContexts.ts`
  - data 계층에서 필요한 task context join만 이동

수정 대상은 `src/data/repositories/types.ts`, 관련 mutation과 local/remote repository, 기존 feature type·validator·selector 파일이다. UI 전용 label·action 타입과 화면 selector는 feature에 남긴다.

방법:

1. 프레임워크와 저장 방식에 무관한 operation 계약을 `src/data/contracts.ts`에 만든다.
2. 기존 feature·reducer 타입 파일은 새 타입을 재-export해 기존 import를 보존한다.
3. local/remote repository가 같은 순수 validator를 사용하게 한다.
4. 함수 본문, 오류 문구, trim 순서, 길이 제한, 상태전이 조건을 문자 단위로 이동한다.
5. type-only import가 runtime import로 변하지 않는지 확인한다.

완료 기준:

- `src/data/**`에서 `src/features/**`로 향하는 import 0개
- repository interface가 `src/data/local/**`를 import하지 않음
- 공개 import 경로를 사용하는 기존 테스트 무수정 통과
- import cycle 0개 유지

롤백: 새 계약 파일과 re-export를 한 커밋으로 되돌리면 기존 경로가 즉시 복원돼야 한다.

### RF-03 — master mutation의 repository 완전 위임

목표: `src/data/mutations/master.ts`에서 저장 방식 선택을 제거한다.

하나의 PR로 처리하지 않고 다음 세 PR로 나눈다.

#### RF-03A — create/import 위임

대상 심볼:

- `importProducts`
- `importInvites`
- `addAllowedUser`
- `addProduct`
- `addDutyMajorCategory`
- `addDuty`

특별 주의: `createLocalMasterRepository()`의 factory-level active-leader 검증을 무조건 유지하면 기존에 검증이 없던 method에 새 오류가 생길 수 있다. 기존 delete 4개와 각 신규 method의 실제 검증 시점·우선순위를 테스트로 고정한 뒤 method-level로 옮긴다.

#### RF-03B — assignment 위임

대상 심볼:

- `saveProductAssignments`
- `saveDutyAssignments`
- `assignProduct`
- `assignDuty`

Remote `assignProduct(transfer=true)`는 `assign_product_and_transfer_change_tasks` RPC 성공 직후 return하고 client activity log를 추가하지 않는 현재 동작을 유지한다. Local transfer는 assignment와 task 상태 갱신 뒤 task별 로그를 순차 `await`하며 `Promise.all`로 바꾸지 않는다. 기존 배정 상태인 no-op은 상태·로그 없이 return한다.

#### RF-03C — update/toggle 위임

대상 심볼:

- `updateProduct`
- `updateDutyMajorCategory`
- `updateDuty`
- `updateInvite`
- `toggleProfileActive`
- 기존 delete 4개 wrapper

method별 local 검증의 현재 비대칭을 유지한다. `updateProduct`와 `updateDutyMajorCategory`에 새로운 공통 leader guard를 추가하지 않으며, `updateDuty`, `updateInvite`, `toggleProfileActive`의 기존 active-leader 검증과 마지막 active leader 보호는 유지한다.

각 PR의 공통 순서:

1. local/remote 분기별 호출·오류·로그 순서를 특성화 테스트로 기록한다.
2. 필요한 메서드를 repository interface에 한 번에 한 operation군만 추가한다.
3. local 구현은 기존 reducer 호출을 그대로 감싼다.
4. remote 구현은 기존 Supabase/RPC 호출을 순서 변경 없이 옮긴다.
5. facade는 기존 normalization과 repository 위임만 수행한다.

금지:

- 여러 RPC를 새 RPC로 합치기
- local/remote 오류를 새 공통 오류로 치환하기
- 병렬화 또는 await 순서 변경
- 삭제·배정·수정 동작의 권한 로직 변경

완료 기준:

- 최종 `master.ts`의 Supabase, feature selector, local reducer import 0개
- `master.ts`에서 `ctx.isRemote` 기반 persistence 분기 0개
- 공개 mutation export와 함수 시그니처 변화 0개
- local/remote 계약 테스트와 RLS CI 통과
- RF-03A/B/C가 각각 독립적으로 revert 가능

### RF-04 — local reducer 도메인별 기계적 분할

목표: `appDataReducers.ts`의 충돌 범위와 탐색 비용을 줄인다.

방법:

- `src/data/local/reducers/announcementReducers.ts`
- `src/data/local/reducers/reviewReducers.ts`
- `src/data/local/reducers/projectReducers.ts`
- `src/data/local/reducers/masterReducers.ts`
- `src/data/local/reducers/relationSnapshots.ts`
- 1차 PR에서는 함수 본문을 수정하지 않고 그대로 이동한다.
- `src/data/local/appDataReducers.ts`는 기존 모든 이름을 재-export한다.
- payload 이름과 반환 타입을 유지한다.

검증:

- 기존 reducer 테스트 무수정 통과
- 입력 fixture와 출력의 deep equality
- 호출부 import 변경을 최소화하고 공개 barrel 유지
- 배열 순서, cascade removal 범위, assignment dedup, timestamp 호출 횟수, 변경되지 않은 배열의 참조 보존

### RF-05 — 탐색 메타데이터 단일화

목표: 탭 표시 이름·순서·역할 조건의 중복을 제거한다.

대상:

- `src/lib/navigation.ts`
- `src/screens/Shell.tsx`
- `src/components/CommandPalette.tsx`
- 관련 테스트

방법:

- `src/app/tabMetadata.ts`에 기존 tab ID를 기준으로 label, order, role visibility, header label/description만 정의한다.
- Shell과 CommandPalette가 같은 메타데이터를 읽게 한다.
- `AppRoutes.tsx`의 명시적 조건부 렌더링과 화면별 props 전달은 유지한다.
- icon, 실시간 count, route component는 metadata에 넣지 않는다.
- `APP_TABS` 값과 순서, `TabId` 생성 방식은 변경하지 않는다.

역할 집합:

- leader-only: `review-stats`, `team`, `products`, `duties`, `invites`, `activity`
- member-only: `work`
- 공통: `dashboard`, `announcements`, `reviews`, `change-applications`, `projects`

완료 기준:

- 역할별 메뉴 집합, 탭 순서, 표시 문구, 단축키 결과가 기준선과 동일
- 잘못된 tab ID fallback과 딥링크 결과가 동일
- 모든 `APP_TABS` 항목에 metadata가 정확히 하나 존재하고 `AppRoutes` 역할 gate와 일치

#### RF-05A — Shell 순수 model 추출

`src/app/shellNavigation.ts`의 `buildShellNavigationModel`과 `buildShellHeaderModel`로 unread/member/task count, 역할별 badge, header label/description, 마지막 동기화 문구만 이동한다. 이 PR에서는 `Shell` JSX를 한 줄도 바꾸지 않는다.

반드시 유지할 계산:

- leader review badge: unread가 있으면 unread, 아니면 pending count
- member review badge: unread가 있으면 unread, 아니면 member review count
- member work count: product count + duty count
- pending change task: `pending`이면서 leader는 전체, member는 본인 assignee만
- `ko-KR`의 hour/minute 동기화 문구

#### RF-05B — Shell 표현 컴포넌트 분리

신규 후보:

- `src/components/shell/ShellSidebar.tsx`
- `src/components/shell/ShellTopbar.tsx`
- `src/components/shell/ShellToastViewport.tsx`

`sidebarOpen`, `notifOpen`, `density`, `ui:density`와 root `data-density` effect는 `Shell`에 남긴다. wrapper, className, `aria-*`, button type, `<aside>/<nav>/<main>/<header>` 관계를 바꾸지 않는다. 탭 클릭은 `setActiveTab` 후 sidebar close, 모두 읽음은 callback 후 panel close 순서를 유지한다.

### RF-06 — `App` 딥링크 해석 effect 추출

목표: 앱 소유 상태를 바꾸지 않고 capped history 딥링크 I/O만 테스트 가능한 훅으로 격리한다.

신규 파일: `src/app/hooks/useDeepLinkEntityResolution.ts`

이동 대상:

- 딥링크 entity 해석 및 선택
- history lookup/abort ref
- review/announcement on-demand loader 선택
- stale response 방지, not-found 처리, abort cleanup

남겨 둘 책임:

- 인증 세션과 profile 상태 소유
- app data 로딩과 갱신 세대 토큰
- 현재 탭·선택 상태의 최상위 조립
- provider와 route의 실제 결합
- 검토 읽음 상태 effect
- command palette와 키보드 동작
- `AppRoutes`의 명시적 조건 렌더링

불변 의미:

- `dataReady = isPreviewMode || lastSyncedAt != null`
- on-demand fetch 대상은 review와 announcement만
- change application, project, team은 현재 목록에 없으면 즉시 entity ID 제거
- 같은 `tab:id` 중복 조회 금지와 stale 결과 무시
- not-found와 fetch 오류의 기존 warning 문구·tone
- effect dependency, cleanup, hook 상대 순서와 첫 렌더 시점

### RF-07 — 변경 신청 화면 단계적 분리

목표: 현재 작업 중인 핵심 화면을 권한·상태 회귀 없이 유지보수 가능한 단위로 나눈다.

전제: RF-00, RF-01, RF-02 완료.

#### RF-07A — 순수 view model

신규 `src/features/change-applications/changeApplications.viewModel.ts`에 다음 계산만 이동한다.

- task/application filter
- KPI 계산
- selected application 해석
- task context grouping

member scope, 다른 사용자의 draft 비노출, attention/overdue/due-soon 경계, leader-only unassigned count, 첫 필터 결과 fallback, `ko` locale group 정렬을 고정한다. 이 PR에서는 JSX와 event handler를 변경하지 않는다.

#### RF-07B — 표현 컴포넌트

신규 후보:

- `src/features/change-applications/components/ChangeTaskRow.tsx`
- `src/features/change-applications/components/ChangeApplicationList.tsx`
- `src/features/change-applications/components/ChangeApplicationDetail.tsx`
- `src/features/change-applications/components/ChangeTaskGroupList.tsx`

모든 `useState`, initial selection effect, history load, save/dialog, mutation과 `setData`는 panel에 남긴다. 자식은 전달된 model 렌더링과 callback 호출만 담당하고 자체 조회·필터를 하지 않는다.

불변 확인:

- 빈 상태와 0/0 진행 표시
- 선택 유지와 딥링크 선택
- 리더/구성원별 버튼 노출
- 게시 후 콘텐츠 잠금, 완료/재개, 이관
- 이력 정렬과 optimistic/local 반영 시점
- focus restore, Escape, aria label
- `article.change-task-row`, `data-status`, column 순서, progress width와 empty/history 문구

### RF-08 — 나머지 화면의 선택적 분리

파일 크기만으로 일괄 분리하지 않고, 다음 세 항목만 각각 별도 PR로 수행한다.

#### RF-08A — Projects controller

신규 `src/features/projects/useProjectsPanelController.ts`에 form, composer/assignment modal 상태와 create/edit/assignment/delete command를 이동한다.

`ProjectsPanel`에는 query/filter/view, selector, initial deep-link effect, DOM scroll과 2,600ms highlight, JSX 조립을 남긴다. form reset, modal close, selected ID reset, delete confirm의 기존 순서를 고정한다.

#### RF-08B — Reviews mutation commands

`ReviewsPanel`은 이미 draft/selection hook과 list/kanban/detail/modal이 분리돼 있으므로 전체 presentation 재분할을 거절한다. 신규 `src/features/reviews/useReviewCommands.ts`에 create/withdraw/reject/status/reopen/resubmit/feedback command만 이동한다.

attachment 순서는 입력 검증 → remote upload → review 저장 → 저장 실패 시 이번에 올린 파일만 제거 → 오류 재throw → create/update별 기존 reset으로 유지한다. 기존 attachment를 삭제하거나 update 성공 시 draft storage를 새로 지우지 않는다.

#### RF-08C — ReviewRequestItem model과 표현 블록

신규 후보:

- `src/features/reviews/reviewRequestItemModel.ts`
- `src/features/reviews/components/ReviewTimeline.tsx`
- `src/features/reviews/components/ReviewFeedbackSection.tsx`

attachment effect, notice/celebration, feedback edit state, focus, confirm, timer, mutation callback은 부모에 남긴다. 1,400ms celebration, 2,600ms transition notice, feedback-empty reject focus, confirm 취소, 제출 중 draft 보호 동작을 fake timer와 DOM/ARIA로 고정한다.

`AnnouncementsPanel`, `ReviewStatsPanel`, `ReviewsPanel`의 나머지 presentation은 현재 실행 범위에서 분리하지 않는다. 추가 분리는 실제 변경 충돌이나 테스트 곤란의 증거가 생겼을 때 별도 계획으로 판단한다.

### RF-09 — `fetchAppData` orchestrator 보존형 분할

목표: `fetchAppData.ts`의 호출 순서·병렬성·실패 계약을 보존하면서 query 정의와 순수 조립만 분리한다.

신규 후보:

- `src/data/fetch/reviews.ts`
- `src/data/fetch/changeApplications.ts`
- `src/data/fetch/announcements.ts`
- `src/data/fetch/master.ts`
- `src/data/fetch/projects.ts`
- `src/data/fetch/optional.ts`
- `src/data/fetch/appDataAssembly.ts`

허용:

- 내부에서 `await`하지 않는 동기식 query-builder
- query 결과를 `AppData`로 만드는 순수 함수
- optional 결과에서 warning을 만드는 순수 함수
- profile merge와 정렬을 입력/출력 기반 helper로 추출
- 기존 by-id fetch의 파일 이동과 named re-export

보류:

- 14개 핵심 쿼리의 `Promise.all` 구조 변경
- 5개 선택 쿼리의 `Promise.allSettled` 구조 변경
- domain별 독립 async fetch 함수
- 쿼리 순서, select 필드, filter, sort, limit 변경
- 캐시·재시도·지연 로딩 도입
- attachment, activity log, auth, realtime, storage의 generic adapter 재설계

호출 순서:

- core: profiles → products → duty categories → duties → product assignments → duty assignments → reviews → projects → project assignments → change applications → action items → change tasks → scope RPC → assignee RPC
- optional: allowed users → profile notes → activity logs(limit 100) → public leader profiles → announcements(limit 200)

완료 기준:

- core 완료 후에만 optional 시작
- 핵심 실패는 기존 배열의 첫 error로 전체 실패
- 선택 실패는 같은 한글 warning과 fallback 생성
- from/RPC, select, modifier, order, limit, abort, await 시작 trace가 기준선과 동일
- `fetchAppData.ts`의 기존 named export 유지

### RF-10 — CSS 분리 실행 보류

이 항목은 현재 실행 계획에 포함하지 않는다. 아래 근거를 갖춘 별도 요청이 있을 때만 새 계획으로 재평가한다.

사전 조건:

- 리더/구성원 역할별 주요 탭 screenshot 기준선
- 모바일/태블릿/데스크톱 viewport 기준선
- 핵심 요소의 computed style 비교 도구 또는 테스트
- 현재 CSS import 순서와 cascade layer 분석

향후 재평가 시 규칙:

- 한 화면 또는 한 독립 컴포넌트 규칙만 이동
- selector specificity와 source order를 보존
- 디자인 토큰 정리, 클래스 이름 변경, 시각 개선을 함께 하지 않음
- 전후 pixel/DOM/computed style 차이가 있으면 즉시 롤백

이번 계획에서는 `styles.css`와 전용 CSS 파일을 그대로 두고 문서의 실제 CSS 구조 설명만 수정한다.

### RF-11 — 문서와 구조 가드 정리

목표: 완료된 구조 규칙이 다시 무너지지 않게 한다.

작업:

- 실제 CSS 파일 구성, repository 경계, local/remote 동작을 architecture 문서에 반영
- 각 리팩토링 PR에서 해소한 항목만 이 문서에 완료 표시
- 새 data → feature 역참조와 순환 import를 CI에서 검사할 경량 스크립트 검토

새 검사 도구나 dependency가 필요하면 이번 계획에 바로 추가하지 않고 별도 승인 대상으로 둔다.

## 7. 권장 PR 순서

```text
RF-00 현재 기능 체크포인트
  → RF-01 특성화 테스트
  → RF-02 계약/검증기 의존 방향
  → RF-04 reducer 기계적 분할
  → RF-09 fetch orchestrator 보존형 분할
  → RF-03A master create/import 위임
  → RF-03B master assignment 위임
  → RF-03C master update/toggle 위임
  → RF-05 탐색 메타데이터
  → RF-05A Shell model
  → RF-05B Shell 표현
  → RF-06 App 딥링크 effect
  → RF-07A 변경 신청 view-model
  → RF-07B 변경 신청 표현
  → RF-08A Projects controller
  → RF-08B Reviews commands
  → RF-08C ReviewRequestItem model/표현
  → RF-11 문서/가드
```

RF-05 이후의 UI 작업은 서로 독립적이면 순서를 바꿀 수 있지만 같은 PR로 합치지 않는다. RF-10 CSS, `createPreviewData`, generic I/O/DI, 상태관리·라우터 도입은 실행하지 않는다. 각 UI PR 뒤에는 DOM·visual baseline 승인이 있어야 다음 UI PR로 진행한다.

## 8. PR 운영 규칙

### 8.1 크기 제한

- 하나의 PR은 하나의 책임 이동만 수행한다.
- 이동과 동작 개선을 분리한다.
- 대형 파일 전체 포맷을 금지한다.
- 가능하면 “테스트 추가 커밋 → 기계적 이동 커밋 → import 정리 커밋” 순서를 유지한다.
- rename 추적이 가능하도록 이동 커밋에서 본문 편집을 최소화한다.

### 8.2 PR 설명에 반드시 기록할 내용

- 옮긴 책임과 그대로 둔 책임
- 보호하는 관찰 동작
- 공개 export, RPC, 쿼리, DOM/ARIA 변화 유무
- 실행한 검증 명령과 결과
- 수동 확인 화면과 역할/viewport
- 롤백 단위

### 8.3 공통 자동 게이트

모든 PR:

```powershell
npm run typecheck
npm run lint
npm test -- --reporter=dot
npm run build
```

데이터, repository, mutation, 권한 관련 PR 추가 게이트:

```powershell
npm run test:rls
```

`test:rls`는 로컬 환경이 없으면 GitHub Actions에서 반드시 실행하고, 결과가 없거나 건너뛰면 병합하지 않는다.

### 8.4 추가 검증 매트릭스

| 변경 종류 | 필수 추가 검증 |
|---|---|
| 계약/타입 이동 | 기존 import 경로 컴파일, 공개 export 비교 |
| repository 위임 | local/remote contract, RPC 인자·순서, RLS CI |
| reducer 분리 | deep equality, 원자성, 입력 비변형 |
| App/effect 추출 | StrictMode, cleanup, dependency, 딥링크 |
| UI 컴포넌트 분리 | 역할별 DOM/ARIA, keyboard, modal focus |
| 탐색 메타데이터 | 역할별 탭 집합·순서·문구, fallback |
| CSS 이동 | 역할·탭·viewport screenshot와 computed style 비교 |
| 데이터 로더 | 핵심 실패/선택 실패, 경고, 쿼리 순서·상한 |

## 9. 롤백과 중단 기준

다음 중 하나라도 발생하면 해당 PR을 병합하지 않고 마지막 녹색 커밋으로 되돌린다.

- 기존 테스트 기대값을 바꿔야만 새 구조가 통과함
- 기능, 권한, 문구, 화면 구성, DOM/ARIA 또는 키보드 동작 차이
- local과 remote 결과 또는 오류 의미 차이
- RPC/쿼리 수, 인자, 순서, 필터, 정렬 또는 limit 차이
- DB migration, RLS, 환경 변수, 의존성, 빌드 설정 변경이 필요해짐
- 기존 공개 import나 함수 시그니처를 유지할 수 없음
- RLS 작업이 실패하거나 실행되지 않음
- UI 전후 비교에서 설명되지 않는 시각 차이
- PR이 두 개 이상의 작업 패키지 책임을 포함하게 됨

롤백은 파일 일부를 임의로 되돌리는 방식이 아니라 해당 독립 PR 또는 책임 이동 커밋 전체를 revert하는 방식으로 수행한다.

## 10. 완료 정의

이 계획의 완료는 파일이 작아졌다는 사실만으로 판단하지 않는다. 아래가 모두 충족돼야 한다.

- 기능·화면 구성·권한·외부 계약 변화 0건
- 공통 게이트와 관련 RLS 게이트 전부 통과
- data 계층의 feature 역참조 제거
- `master.ts`의 persistence 선택 분기 제거, 공개 facade 유지
- local reducer의 도메인별 책임 분리와 기존 barrel 유지
- 탐색 메타데이터 중복 제거, 명시적 route 조립 유지
- `App`과 대상 화면의 책임이 테스트 가능한 단위로 축소
- 데이터 로더의 핵심/선택 실패 의미 보존
- CSS, `createPreviewData`, generic I/O/DI는 실행 범위에서 제외되고 기준선 그대로 유지
- architecture 문서가 실제 구조와 일치
- 각 PR이 독립적으로 revert 가능

## 11. 첫 실행 단위

첫 리팩토링 PR은 RF-02가 아니라 RF-00이다. 현재 미커밋 변경 신청 기능을 기능 자체의 테스트와 RLS로 완결하고 기준 커밋을 만든 뒤, RF-01 특성화 테스트만 담은 PR부터 시작한다. 이 순서를 지키는 것이 기능 변경과 구조 변경을 분리하는 가장 중요한 안전장치다.

## 12. 실행 기록 (2026-07-17)

기능 기준선 커밋과 계획 커밋을 먼저 분리한 뒤, 관찰 동작을 고정하는 특성화 테스트를 추가하고 다음 저위험 구조 개선을 적용했다.

- RF-01: 데이터 로더의 핵심 실패, 선택 실패, 경고 순서, 병합·중복 제거 동작을 특성화 테스트로 고정
- RF-02: 데이터 계약·검증·selector를 `src/data` 소유로 이동하고 기존 feature 경로는 호환 re-export로 유지
- RF-03: `master.ts`를 공개 facade로 유지하면서 local/remote persistence를 repository로 분리
- RF-04: local reducer를 announcement, review, project, master 도메인으로 분리하고 기존 barrel 경로 유지
- RF-05: 역할별 탐색 메타데이터를 단일 소스로 통합하되 탭 순서와 sidebar, palette, header 문구를 각각 보존
- RF-06: 딥링크 effect와 화면 계산 모델을 테스트 가능한 순수 단위로 추출하되 기존 JSX, DOM/ARIA, hook dependency를 유지
- 데이터 로더 조립 로직을 순수 함수로 분리하되 요청 병렬성, 쿼리 순서·상한, 첫 오류 선택 규칙을 유지

이번 실행에서는 CSS 분리, route 동적 분할, `createPreviewData` 분해, generic I/O/DI 도입, 대형 JSX 재구성을 제외했다. 이 작업들은 시각·타이밍·초기화 순서 회귀 위험이 더 크므로 별도 기준선과 독립 PR이 준비된 뒤에만 진행한다.

### 12.1 검증 결과

```text
npm run typecheck              PASS
npm run lint                   PASS
npm test -- --reporter=dot     PASS (82 files passed, 6 skipped; 423 passed, 39 skipped)
npm run build                  PASS (bundle budget 포함)
git diff --check               PASS
```

- 의존성, 패키지 잠금, TypeScript/Vite 설정 변경 없음
- `src/data`에서 `src/features`로 향하는 역참조 0건이며 경계 테스트로 고정
- local/remote mutation의 guard, 로깅, RPC 인자·순서, 오류 의미를 contract 테스트로 확인
- 변경 신청 화면을 전후 캡처로 비교해 레이아웃, 문구, 카운트, 행 순서가 동일함을 확인
- 명령 팔레트의 역할별 항목, 순서, 접근성 이름을 확인
- 개발 브라우저 콘솔 오류 없음
- 로컬 Supabase 실행 환경이 없어 RLS 테스트는 건너뛰었으며, 병합 전 GitHub Actions의 RLS 작업 성공을 필수 조건으로 둔다.
