# SQA P1 Workflow 개선 마스터 계획서

> 작성 기준일: 2026-07-11 (운영 배포 개시일)
> 근거: 8개 관점 다각도 코드 검토 + 지적별 적대적 검증(반박 시도)으로 확정된 31건 + 하드닝 항목.
> 대상 독자: **이 저장소를 처음 보는 코딩 에이전트.** 각 항목은 단독으로 실행 가능하도록 파일·근거·방법·검증을 모두 포함한다.

---

## 0. 이 문서 사용법 (실행 에이전트 필독)

### 0.1 우선순위 체계

| 등급 | 의미 | 착수 시점 |
|---|---|---|
| **P0** | 운영 첫날 보안 침해·데이터 손실·운영 중단을 유발할 수 있음 | 즉시 |
| **P1** | 실사용자에게 잘못된 동작·정정 불가·감사 공백 | 이번 주~이번 달 |
| **P2** | 조건부 버그·성능 부채·운영 관측성 공백 | 이번 달~다음 분기 |
| **P3** | 하드닝·품질·저심각도 | 여유 시 |

### 0.2 각 항목의 필드

- **설명**: 무엇이 문제인가 (현상 + 근거 코드 위치).
- **목적**: 왜 고치는가 (고쳤을 때 얻는 것).
- **개선 방향**: 어떤 접근으로 고칠 것인가 (설계 결정).
- **상세 개선 방법**: 파일·함수·코드 수준의 구체적 절차.
- **검증**: 고친 뒤 무엇을 확인해야 완료인가.
- **영향·주의**: 함께 건드려야 할 것, 깨뜨리면 안 되는 것.

### 0.3 이 저장소에서 반드시 지킬 공통 규칙 (위반 시 회귀 발생)

이 프로젝트에는 아키텍처 계약이 있다. 항목을 고치기 전에 반드시 숙지한다. 원본: [docs/ARCHITECTURE.md](ARCHITECTURE.md).

1. **마이그레이션은 append-only 불변 이력이다.** `supabase/migrations/`의 기존 파일을 **절대 수정·삭제·병합하지 않는다.** 스키마/정책/함수 변경은 항상 **새 파일**을 `YYYYMMDDNNNN_설명.sql` 이름으로 추가한다(뒤 파일이 앞 정의를 `create or replace`로 대체). 새 마이그레이션을 추가하면 **반드시 `src/migrations.test.ts`의 회귀 목록·스냅샷을 함께 갱신**한다(안 하면 테스트 실패).
2. **local(데모)/remote(Supabase) 등가성.** 데이터 계층의 뮤테이션은 `ctx.isRemote` 분기로 두 구현을 가진다. **한쪽만 고치면 데모로 검증한 동작과 실서비스가 어긋난다.** 검증 규칙·결과 형태를 양쪽 동일하게 유지한다. 관련 테스트: `src/data/**/*.test.ts`.
3. **RLS가 권한의 원천, `src/domain/permissions.ts`는 그 거울이다.** RLS 정책을 바꾸면 클라이언트 권한 판정도 함께 바꾸고, `src/domain/permissions.test.ts`로 고정한다.
4. **계층 의존 방향**: `screens → features → lib/domain/types`. features는 screens를 import하지 않는다. 화면은 `src/data`의 함수만 호출한다(Supabase 클라이언트를 화면에서 직접 만지지 않는다 — 예외는 P3-6 참고).
5. **위험한 쓰기는 SECURITY DEFINER RPC로만.** 상태 전이·배정 교체·프로젝트 생성 등은 DB 함수가 원자성·권한을 보장한다. SECURITY DEFINER 함수는 모든 객체를 schema-qualified로 참조하며 `set search_path = ''`를 우선 사용하고, private 스키마가 필요한 감사 함수만 `pg_catalog, public, private, pg_temp`(pg_temp 마지막)를 고정한다. 끝에는 `revoke all ... from public; grant execute ... to authenticated;`를 붙인다.
6. **디자인 토큰 계약**: UI를 손대면 색·크기·간격·라운드·그림자는 [DESIGN.md](../DESIGN.md)의 토큰으로만. 스타일은 `src/styles.css` 한 파일에만.

### 0.4 작업 완료(Definition of Done) 게이트

각 항목 종료 전 아래를 **모두** 통과해야 한다:

```bash
npm run typecheck   # tsc -b, 0 errors
npm run lint        # 0 errors (경고도 새로 만들지 말 것 — P3-8 참고)
npx vitest run      # watch 금지. 전부 통과. RLS 테스트는 로컬 Supabase 없으면 skip됨(정상)
npm run build       # tsc -b && vite build 성공
```

DB 변경이 있으면 로컬 Supabase(`supabase start`)에서 마이그레이션을 적용하고 `tests/rls/`를 실행해 RLS 회귀가 없는지 확인한다(→ P2-12에서 이 절차를 CI에 편입).

### 0.5 브랜치 전략 권고

P0는 항목별 개별 PR(리뷰·롤백 용이). P1 이하는 관련 항목을 묶어도 된다. **DB 마이그레이션이 포함된 PR은 절대 다른 PR과 순서를 뒤섞지 말 것**(append-only 순번이 꼬인다).

---

## 1. P0 — 즉시 (보안·데이터 손실·운영 중단)

### P0-1. 공유 임시 비밀번호 '1234' 체계 전면 개편

> 통합 항목: 로그인 화면 노출(#1) + 서버측 비밀번호 정책 부재(#30) + `mark_password_changed` 우회. **세 결함이 한 뿌리(공유 '1234' 관행)라 함께 처리한다.**

**설명**
세 개의 결함이 겹쳐 운영 첫날부터 계정 탈취 창이 열려 있다.
1. 공개 로그인 화면이 비인증 방문자에게 "최초 비밀번호는 1234"라고 그대로 안내한다. → [src/screens/AuthPanel.tsx:42-45](../src/screens/AuthPanel.tsx)
2. 새 비밀번호 8자·'1234' 재사용 금지 검증이 **React 클라이언트에만** 있다. 사용자가 자기 access token으로 GoTrue API(`PUT /auth/v1/user`)를 직접 호출하면 검증을 우회해 '1234'를 유지할 수 있다. 로그인 폼은 이제 길이 정책을 강제하지 않고, 실제 새 비밀번호 정책은 PasswordChangePanel과 Supabase Auth 설정이 담당한다. → [src/screens/PasswordChangePanel.tsx:54-70](../src/screens/PasswordChangePanel.tsx), [src/app/constants.ts:4](../src/app/constants.ts)
3. `mark_password_changed()`는 `auth.uid()`가 null인지만 확인하고 `must_change_password`를 false로 뒤집을 뿐, **실제 비밀번호가 바뀌었는지 검증하지 않는다.** 공유 '1234' 세션이 `rpc('mark_password_changed')`를 직접 호출하면 '1234'를 유지한 채 RLS 게이트를 열 수 있다. → [supabase/migrations/202607040001_require_password_change.sql:4-29](../supabase/migrations/202607040001_require_password_change.sql)

**목적**
인터넷에 노출된 운영 앱에서 "알려진 공유 비밀번호 + 계정 선점"으로 임의 계정을 탈취할 수 있는 경로를 원천 차단하고, 서버가 비밀번호 정책의 실제 강제자가 되게 한다.

**개선 방향**
"공유 '1234'"를 "계정별 랜덤 임시 비밀번호"로 바꾸고, 비밀번호 변경 강제를 **클라이언트 신뢰에서 서버(DB 트리거) 신뢰로** 옮기며, 로그인 화면에서 공격 전제 정보를 제거한다.

**상세 개선 방법**

(a) **서버 비밀번호 정책 상향 [운영 수동 작업 — 코드 아님, 문서화 필수]**
Supabase Dashboard → Authentication → Providers/Policies → Passwords:
- Minimum password length: **8 이상**
- Leaked password protection(HaveIBeenPwned): **활성화**
이 작업은 코드로 재현되지 않으므로 [docs/OPERATIONS.md](OPERATIONS.md)의 계정 관리 절에 "완료일·설정값"을 기록한다.

(b) **임시 비밀번호를 계정별 랜덤 8자 이상으로 발급**
파트장이 Supabase 대시보드에서 계정 생성 시 공유 '1234' 대신 계정별 랜덤 문자열(8자+)을 발급하고 개별 채널로 전달하도록 온보딩 절차를 변경. → OPERATIONS.md의 온보딩 절 갱신. 로그인 폼은 기존 계정 호환을 위해 길이 검사를 하지 않으며, 새 비밀번호 입력 화면과 서버 설정에서 최소 8자를 강제한다.

(c) **로그인 화면에서 공격 전제 정보 제거**
[src/screens/AuthPanel.tsx:42-45](../src/screens/AuthPanel.tsx)의 `<p>` 문구에서 "최초 비밀번호는 1234이며" 및 "계정은 파트장 초대 후 Supabase에서 생성됩니다"의 구체 절차를 제거. 대체 문구 예: "계정은 파트장에게 문의하세요. 로그인만 지원합니다." (임시 비밀번호는 개별 전달)

(d) **`mark_password_changed` 우회 차단 — coordinated rollout 대기**
클라이언트가 `must_change_password`를 임의로 내리지 못하게 하는 서버 연계는 아직 별도 rollout이 필요하다. `encrypted_password` 변경 트리거만으로는 bcrypt 재해시를 구분할 수 없으므로, 신뢰된 서버/Edge Function과 Auth 통합 검증을 완료하기 전에는 기존 RPC를 유지한다.

**검증**
- 서버 정책: 대시보드에서 4자 비밀번호로 `updateUser`가 거부되는지 실측.
- (d): trusted server/Edge Function과 Auth 통합 흐름이 준비되기 전까지는 미검증 상태로 유지한다. `encrypted_password` 트리거만으로 완료를 선언하지 않는다.
- 로그인 화면에 '1234'/계정생성 문구가 없는지 확인.

**영향·주의**
`must_change_password` 게이트는 [src/App.tsx:162](../src/App.tsx)·RLS의 `password_is_current()`([202607080001](../supabase/migrations/202607080001_enforce_password_change_and_restore_visibility.sql))가 함께 소비한다. 트리거로 바꿔도 이 소비자들은 그대로 동작해야 한다(플래그의 의미는 불변, 갱신 주체만 바뀜).

---

### P0-2. 단건 배정을 스테일 스냅샷 '전체 교체'에서 'add-only'로 전환

**설명**
`assignProduct`/`assignDuty`는 의미상 "한 명 추가"인데, 원격 경로가 **최대 5분 묵은 클라이언트 스냅샷**(`ctx.data`)에서 현재 배정 목록을 읽어 `[...currentIds, userId]`로 **전체 교체 RPC**(`replace_product_assignments`)를 호출한다. 그 사이 다른 파트장·다른 탭이 추가한 배정이 스냅샷에 없으면 RPC의 `delete ... where user_id <> all(p_member_ids)`가 **조용히 삭제**한다. 성공 토스트가 뜨고 흔적도 없다. 로컬 경로는 `appendProductAssignment`로 순수 추가라 **local/remote 등가성도 이미 깨져 있다.**
근거: [src/data/mutations/master.ts:259-309](../src/data/mutations/master.ts) (assign), [master.ts:194-257](../src/data/mutations/master.ts) (saveXAssignments→replace RPC), [supabase/migrations/202607060002:42-52](../supabase/migrations/202607060002_p1_product_unique_and_assignment_rpcs.sql) (delete-not-in-list).

**목적**
동시 작업 시 배정이 소리 없이 사라지는 데이터 손실을 제거하고, 단건 추가의 local/remote 동작을 일치시킨다.

**개선 방향**
단건 추가에는 스냅샷에 의존하는 '교체' RPC를 쓰지 않는다. **삽입만 하는 전용 RPC**를 새로 만들어 `assignProduct`/`assignDuty` 원격 경로가 그것을 호출하게 한다. '교체'는 P1-1의 배정 편집 UI에서만 쓴다.

**상세 개선 방법**
1. 새 마이그레이션 `supabase/migrations/202607110001_add_single_assignment_rpcs.sql`:
   ```sql
   create or replace function public.add_product_assignment(p_product_id uuid, p_user_id uuid)
   returns void language plpgsql security definer set search_path = public as $$
   begin
     if not public.is_active_leader() then raise exception 'permission denied'; end if;
     if not exists (select 1 from public.products where id = p_product_id) then
       raise exception 'product not found'; end if;
     insert into public.product_assignments (product_id, user_id)
     values (p_product_id, p_user_id)
     on conflict (user_id, product_id) do nothing;
   end; $$;
   revoke all on function public.add_product_assignment(uuid, uuid) from public;
   grant execute on function public.add_product_assignment(uuid, uuid) to authenticated;
   -- add_duty_assignment(p_duty_id, p_user_id) 동일 패턴 (duty_assignments, on conflict (user_id, duty_id))
   ```
2. [src/data/mutations/master.ts](../src/data/mutations/master.ts) `assignProduct` 원격 분기를 `saveProductAssignments(...)` → `supabase!.rpc('add_product_assignment', { p_product_id, p_user_id })`로 교체. `assignDuty`도 동일. 기존 `currentIds` 계산과 `[...currentIds, userId]`는 제거(더는 필요 없음). 로컬 분기(`appendProductAssignment`)는 유지 → 이제 양쪽 다 순수 추가로 등가.
3. `src/migrations.test.ts` 갱신.
4. RLS: 파트장 insert 권한은 RPC(SECURITY DEFINER)가 제공하므로 테이블 직접 insert 정책은 불필요.

**검증**
- 두 브라우저(또는 두 탭)에서 같은 제품에 서로 다른 파트원을 거의 동시에 배정 → **둘 다 남는지** 확인(기존엔 나중 것이 앞 것을 삭제).
- 데모 모드와 원격 모드에서 단건 배정 결과가 동일한지.
- `add_product_assignment`를 파트원 세션으로 호출 시 `permission denied` 예외.

**영향·주의**
`replace_product_assignments`/`replace_duty_assignments`는 **삭제하지 말 것** — P1-1 배정 편집(전체 교체) UI가 사용한다. 이 항목은 "단건 추가"만 add-only로 분리하는 것이다.

---

### P0-3. 백업 일일화 + 마이그레이션 사전 백업 의무화

**설명**
검토 당시 백업이 주 1회뿐이라 RPO(복구 목표 시점)가 최대 7일이었다. 현재 후보 브랜치는 매일 백업과 동일 SHA 백업 gate를 추가했지만, 실제 Actions run·복원 리허설 증거는 아직 운영에서 확인하지 않았다.
근거: [.github/workflows/backup.yml](../.github/workflows/backup.yml)와 [.github/workflows/db-migrate.yml](../.github/workflows/db-migrate.yml)의 현재 후보 gate, [docs/OPERATIONS.md](OPERATIONS.md)의 복원 절차.

**목적**
데이터 손실 최대치를 7일에서 1일 이하로 줄이고, 마이그레이션 사고 시 직전 상태로 복구할 수 있게 한다. (암호화 아티팩트 약 33KB → 일 단위로도 비용 무시 가능: 33KB×90일 ≒ 3MB.)

**개선 방향**
백업 cron을 매일로, 마이그레이션 워크플로에 사전 백업을 파이프라인 또는 문서 게이트로 편입.

**상세 개선 방법**
1. [.github/workflows/backup.yml](../.github/workflows/backup.yml)의 `schedule.cron`에서 요일 필드를 `*`로 바꿔 매일 실행(시각은 05:00 KST 유지 = `0 20 * * *`). 실행 전 현재 cron 값을 열람해 시·분을 정확히 보존할 것. `retention-days`는 유지.
2. 사전 백업 — 둘 중 하나:
   - **(권장) 자동화**: [.github/workflows/db-migrate.yml](../.github/workflows/db-migrate.yml)의 push(적용) 단계 **앞에** backup.yml과 동일한 `pg_dump → openssl 암호화 → upload-artifact` 스텝을 삽입(같은 secrets 재사용). 백업 성공을 조건으로만 push가 진행되게 `needs`/스텝 순서 구성.
   - **(최소) 문서 게이트**: [docs/MANUAL_TASKS_PLAN.md](MANUAL_TASKS_PLAN.md) 작업 C와 [docs/SUPABASE_MIGRATIONS.md](SUPABASE_MIGRATIONS.md)에 "DB Migrate 실행 전 Actions → Backup DB를 수동 1회 실행하고 green을 확인한다"를 **필수 선행 단계**로 명시.
3. 문서 정합성: OPERATIONS.md·ROADMAP의 "주간 백업" 표기를 "매일"로 갱신.

**검증**
- 변경 후 backup.yml을 수동 트리거(workflow_dispatch)해 아티팩트가 생성되는지.
- (자동화 택 시) db-migrate 워크플로 dry-run에서 백업 스텝이 push 앞에 실행되는지.

**영향·주의**
백업 워크플로의 암호화 passphrase(secret) 관리 방식은 P3-9(무결성)과 함께 검토. cron 문법 실수로 백업이 아예 안 도는 일이 없도록 변경 후 첫 스케줄 실행을 반드시 확인.

---

### P0-4. Cloudflare Workers Builds Git 연동 해제 확인 (이중 배포 차단)

**설명**
Workers Builds Git 연동 해제가 문서상 미완으로 남아 있고, HEAD 커밋(`ed3c5cb`)이 그 검증용 no-op probe인데 **결과가 저장소 어디에도 기록되지 않았다.** 연동이 남아 있으면 main push마다 GitHub Actions 배포와 Workers Builds 자동 빌드가 동시에 돌고, 후자는 `VITE_*` env 없이 빌드되어 **정상 배포본 위에 '설정 오류 화면만 뜨는 번들'을 덮어쓸 수 있다** — 운영 중단과 동일 효과.
근거: [docs/MANUAL_TASKS_PLAN.md:398](MANUAL_TASKS_PLAN.md) (미체크 항목), git HEAD `ed3c5cb`.

**목적**
배포 경로를 GitHub Actions 단일로 확정해, 설정 없는 자동 빌드가 운영본을 덮어쓰는 사고를 차단.

**개선 방향**
probe 결과를 확인·기록하고, 연동이 남아 있으면 해제.

**상세 개선 방법**
1. Cloudflare 대시보드 → 해당 Worker → **Builds/Deployments 이력**에서 `ed3c5cb` push 이후 Workers Builds 자동 빌드가 생성됐는지 확인.
2. GitHub에서 autoconfig PR(예: PR #3)이 재생성됐는지 확인.
3. 자동 빌드가 돈다면 → 대시보드에서 **Git 연동 해제(Disconnect)**, autoconfig PR 닫기.
4. 결과(연동 상태/해제일)를 [docs/MANUAL_TASKS_PLAN.md](MANUAL_TASKS_PLAN.md) 10.5 체크박스에 기록.

**검증**
연동 해제 후 임의 no-op 커밋 push → Cloudflare에 자동 빌드가 **생기지 않고** GitHub Actions 배포만 도는지 확인.

**영향·주의**
이 항목은 대부분 대시보드 작업이지만 **미기록 상태를 남기지 말 것.** 다음 운영자가 같은 검증을 반복하거나 이중 배포를 놓친다.

---

## 2. P1 — 데이터 정합성 · 감사 · 정정 수단

### P1-1. 제품·담당업무 배정 해제/교체 UI 배선

**설명**
시스템 목적이 '업무 배정 관리'인데 배정 UI(`ProductAssignModal`·`DutyAssignModal`)는 단일 파트원 select로 **추가만** 지원한다. 해제·전체 교체를 수행하는 `saveProductAssignments`/`saveDutyAssignments`는 데이터 계층·RPC·데모 리듀서까지 구현·테스트되어 있으나 **공개 API(`src/data/index.ts`)에서 export되지 않아** 어떤 화면도 호출하지 못한다. 담당 변경 시 이전 담당자를 뗄 방법이 없고, 유일한 우회가 "제품 삭제 후 재등록"(=배정 전량 cascade 삭제)이다. 프로젝트 배정만 `AssignmentEditModal`로 교체 가능해 도메인 간 비대칭.
근거: [src/data/index.ts](../src/data/index.ts) (saveXAssignments 미export), [src/data/mutations/master.ts:194-257](../src/data/mutations/master.ts) (함수 존재), [src/features/master/products/ProductAssignModal.tsx](../src/features/master/products/ProductAssignModal.tsx) (추가 전용).

**목적**
잘못된 배정을 앱 안에서 되돌리고, 인수인계·담당 변경을 정상 워크플로로 지원.

**개선 방향**
이미 존재하는 교체 함수를 export하고, 프로젝트의 `AssignmentEditModal`을 템플릿 삼아 제품/업무용 "배정 편집"(멤버 체크리스트) 모달을 배선.

**상세 개선 방법**
1. [src/data/index.ts](../src/data/index.ts)의 master 재수출 블록에 `saveProductAssignments`, `saveDutyAssignments` 추가.
2. 템플릿 참조: `src/features/projects/components/AssignmentEditModal.tsx`와 그 배선 화면(`ProjectsPanel`)이 `saveProjectAssignments`를 어떻게 호출하는지 그대로 따른다(멤버 다중 선택 → next member ids → save 호출).
3. `ProductCard`/`DutyTable`(또는 각 마스터 패널)에 "배정 편집" 액션을 추가하고, 체크리스트 모달에서 현재 배정 멤버를 초기 선택값으로 채운 뒤 `saveProductAssignments({ productId, nextMemberIds })`/`saveDutyAssignments`를 `mutate`로 호출.
4. 데모/원격 모두 동작 확인(함수가 이미 양쪽 분기를 가짐).

**검증**
- 배정 편집 모달에서 멤버 해제 후 저장 → 해당 배정만 제거되고 나머지 유지.
- 데모 모드에서도 동일 동작.
- 배정 편집 시 활동 로그 기록(→ P1-3와 함께 처리).

**영향·주의**
`saveXAssignments`의 원격 경로는 여전히 **전체 교체 RPC**를 쓴다 → 동시 편집 lost-update는 P1-7에서 별도 처리. 이 항목은 UI 배선이 핵심.

---

### P1-2. master/projects 원격 update·delete에 0-row 감지 가드 통일

**설명**
`supabaseReviewRepository`는 update/delete에 `.select('id')`를 붙여 0행이면 `UserFacingError`를 던지는데, `master.ts`의 `updateProduct`·`updateDutyMajorCategory`·`updateDuty`·`updateInvite`·`toggleProfileActive`와 `supabaseMasterRepository`·`supabaseProjectRepository`의 update/delete는 0행을 확인하지 않는다. RLS 불일치·이미 삭제된 행 대상 작업이 error 없이 "성공"하고, **활동 로그에 실제로 일어나지 않은 '수정/삭제' 기록이 영구히 남는다.**
근거(문제): [src/data/mutations/master.ts:318](../src/data/mutations/master.ts). 근거(정답 템플릿): [src/data/remote/supabaseReviewRepository.ts:25-36, 71-81](../src/data/remote/supabaseReviewRepository.ts).

**목적**
"아무 일도 안 일어난" 작업에 성공 토스트·허위 감사 로그가 남는 것을 막아 활동 로그를 신뢰 가능하게 한다.

**개선 방향**
리뷰 repository와 동일 패턴으로 통일.

**상세 개선 방법**
대상 각 update/delete에 대해:
```ts
const { data: affected, error } = await supabase!.from('products').update(payload).eq('id', productId).select('id')
if (error) throw error
if (!affected || affected.length === 0) {
  throw new UserFacingError('이미 삭제되었거나 변경할 수 없는 항목입니다. 목록을 새로고침해 주세요.')
}
```
그리고 `recordActivityLog`는 **반영이 확인된 뒤에만** 호출(P1-3에서 로그 추가 시 순서 준수).
대상: `master.ts`의 update/delete 원격 분기 전부 + `supabaseMasterRepository`·`supabaseProjectRepository`의 update/delete.

**검증**
존재하지 않는 id로 update/delete 시도 → 성공 토스트 대신 안내 오류. 데모 경로도 동일한 "미존재" 처리인지 확인(local/remote 등가).

**영향·주의**
ROADMAP Phase 3-4의 "master를 repository로 위임" 작업과 겹친다. 위임을 함께 진행한다면 이 가드를 위임된 repository에 넣는다.

---

### P1-3. 배정·마스터 변경을 활동 로그에 기록 (감사 커버리지 대칭화)

**설명**
활동 로그 화면(`ActivityPanel`)과 `product_assignment`/`duty_assignment` entity_type이 있으며, master 뮤테이션의 원격 성공 경로에도 `recordActivityLog`를 추가했다. 서버 RPC가 원자적으로 기록하는 검토 상태·피드백 생성은 중복 방지를 위해 클라이언트 보조 로그를 제거했고, 나머지 master 변경은 여전히 best-effort 보조 로그다.
근거: [src/data/mutations/master.ts](../src/data/mutations/master.ts), [src/data/remote/supabaseReviewRepository.ts](../src/data/remote/supabaseReviewRepository.ts), [supabase/migrations/202607110010_atomic_review_activity_logs.sql](../supabase/migrations/202607110010_atomic_review_activity_logs.sql).

**목적**
"누가 언제 이 제품을 이 파트원에게 배정/해제했나"에 이력을 남겨 배정 관리 시스템의 감사성을 확보.

**개선 방향**
프로젝트 저장소와 동일한 로깅 패턴을 master 뮤테이션에 추가(최소한 배정 교체·활성 토글·수정·삭제).

**상세 개선 방법**
각 원격 뮤테이션 성공(0-row 가드 통과, P1-2) 직후 `recordActivityLog(setData, {...}, { isRemote: true })` 호출. `entityType`은 DB 제약이 허용하는 값 사용(`product_assignment`/`duty_assignment`/`product`/`duty`/`invite` 등 — [supabase/migrations/202607070004_extend_activity_log_entity_types.sql](../supabase/migrations/202607070004_extend_activity_log_entity_types.sql)에서 허용 목록 확인). `summary`는 사람이 읽을 한국어 문장, `metadata`에 변경 상세.

**검증**
배정/수정/토글 후 ActivityPanel에 항목이 뜨는지. entity_type 제약 위반으로 insert 실패하지 않는지(허용 목록 대조).

**영향·주의**
현재 로그는 클라이언트 best-effort라 무결성이 약하다 → 근본 강화는 P1-4. 이 항목은 커버리지(빠진 도메인 채우기), P1-4는 무결성(서버 기록).

---

### P1-4. 감사 로그를 서버측(트랜잭션 내) 기록으로 강화

**설명**
기존 master 경로의 `activity_logs` 기록은 여전히 클라이언트 best-effort라 네트워크 단절·탭 닫힘·RLS 오류 시 누락될 수 있다. 다만 검토 상태 승인·반려와 피드백 생성은 `202607110010` RPC 내부에서 본 작업과 같은 트랜잭션으로 기록한다.
근거: [src/lib/activityLog.ts](../src/lib/activityLog.ts), [supabase/migrations/202607110010_atomic_review_activity_logs.sql](../supabase/migrations/202607110010_atomic_review_activity_logs.sql).

**목적**
감사 이력을 데이터 정정·책임 추적의 신뢰 근거로 만든다(작업과 이력의 원자성).

**개선 방향**
상태 전이·배정 교체 등 핵심 RPC 내부에서 `activity_logs`를 함께 insert해 한 트랜잭션으로 묶는다. 클라이언트 기록은 보조로만.

**상세 개선 방법**
새 마이그레이션으로 대상 RPC(`update_review_request_status`, `reject_review_request`, `replace_*_assignments`, `add_*_assignment`, 프로젝트 생성/배정 RPC)를 `create or replace`하여 함수 끝에 `insert into public.activity_logs (...) values (...)` 추가. actor는 `auth.uid()`로 프로필 조회. 클라이언트의 `recordActivityLog`는 중복을 피하려면 서버 기록으로 이전한 항목에서 제거하거나, 서버 기록이 없는 항목만 유지.

**검증**
로컬 Supabase에서 상태 전이 RPC 호출 후 activity_logs에 행이 남는지. 클라이언트 로그 호출을 강제로 실패시켜도 서버 로그는 남는지.

**영향·주의**
검토 상태·피드백 RPC는 시그니처를 유지한 채 서버 트랜잭션 로그를 적용했다. 배정·master·프로젝트 RPC까지 서버 기록으로 이전하는 작업은 별도 후속 범위이며, `src/migrations.test.ts`와 원격 DB readiness gate가 새 계약을 검사한다.

---

### P1-5. 종결된 검토요청 재오픈 / 파트장 오클릭 정정 수단

**설명**
상태 전이는 RPC가 `pending→approved`, `pending→rejected` 단방향만 허용하고, UI 상태 버튼도 pending에서만 렌더된다. 파트장이 '완료 처리'를 **확인 단계 없이** 잘못 누르면 앱 내 복구 경로가 없고, 반려 피드백 오타 수정·삭제 UI도 없다(RLS는 leader의 `review_feedback` update/delete를 허용하나 화면 미구현). 정정이 Supabase 콘솔 직접 수정에 의존.
근거: [src/features/reviews/components/ReviewRequestItem.tsx:152](../src/features/reviews/components/ReviewRequestItem.tsx), [supabase/migrations/202607060004_review_status_transitions.sql](../supabase/migrations/202607060004_review_status_transitions.sql).

**목적**
운영 첫날부터 발생 가능한 파트장 오클릭을 앱 안에서 되돌릴 수 있게 한다.

**개선 방향**
`approved/rejected→pending` 복귀 RPC(파트장 전용, 활동 로그 포함)를 추가하고 상세 화면에 '재오픈' 액션 배선. 완료/반려 실행에는 2단계 확인 적용.

**상세 개선 방법**
1. 새 마이그레이션: `reopen_review_request(p_review_request_id uuid)` RPC — `is_active_leader()` 검사 후 `approved|rejected → pending` 전이 허용. `revoke/grant` 규칙 준수. activity_logs 기록.
2. `assertReviewStatusTransition`([src/features/reviews/review.validators.ts](../src/features/reviews/review.validators.ts))에 역전이 허용 규칙 반영(클라이언트 거울).
3. 데이터 계층에 `reopenReviewRequest` 추가(원격 RPC + 데모 리듀서), `src/data/index.ts` export.
4. `ReviewRequestItem`/`ReviewDetail`에 종결 상태에서 '재오픈' 버튼, '완료/반려'에는 프로젝트 삭제와 같은 확인 모달.
5. (선택) 피드백 수정/삭제 UI — RLS는 이미 허용.

**검증**
완료 처리 → 재오픈 → 다시 pending 목록에 등장. 파트원은 재오픈 불가(RLS). 데모/원격 동일.

**영향·주의**
월간 통계(`buildReviewMonthlyStats`)가 상태별 집계를 하므로 재오픈이 통계에 자연 반영되는지 확인.

---

### P1-6. 회수·삭제 하드 삭제를 소프트 삭제/스냅샷으로 완화

**설명**
검토요청 회수(withdraw)는 행 delete이며 `review_feedback`이 cascade로 사라지고 스토리지 첨부도 즉시 삭제된다. 제품/프로젝트 삭제도 배정을 cascade로 지운다. 2단계 확인은 있으나 **소프트 삭제·휴지통·복구가 전무**하고, 회수된 요청은 월간 통계에서도 사라져 접수 건수가 소급 변동한다.
근거: [src/data/remote/supabaseReviewRepository.ts:71-90](../src/data/remote/supabaseReviewRepository.ts), [src/app/constants.ts:22-28](../src/app/constants.ts) (cascade 경고문).

**목적**
실수 삭제로부터 데이터·통계를 보호하고 복구 가능성을 확보.

**개선 방향**
운영 데이터가 쌓이기 전에 핵심 엔티티에 소프트 삭제(`archived_at`)를 도입하거나, 최소한 삭제 전 스냅샷을 `activity_logs.metadata`에 저장. 회수는 삭제 대신 `withdrawn` 상태로.

**상세 개선 방법**
- **최소안(빠름)**: withdraw/delete RPC 내부에서 삭제 직전 행 전체를 `activity_logs.metadata`(jsonb)에 기록(복구 근거 확보). P1-4와 함께.
- **정석안**: `review_requests`에 `withdrawn` 상태 추가(삭제 대신 상태 전이), `projects`에 `archived_at nullable` 추가 후 조회에서 필터. RLS·통계·목록 selector가 archived를 제외하도록 함께 수정. 새 마이그레이션 + `migrations.test.ts`.

**검증**
회수 후에도 통계·복구 근거가 남는지. 목록에는 안 보이는지.

**영향·주의**
스키마 변경이 넓게 파급(RLS, selector, 통계, 데모 리듀서). 정석안은 P1 중 가장 큰 작업 — 별도 PR로 격리.

---

### P1-7. 배정 교체·프로젝트 수정의 동시성(lost update) 방어

**설명**
`saveProductAssignments`/`saveDutyAssignments`(교체)와 `updateProject`는 화면의 (최대 5분 묵은) 스냅샷 기반 last-write-wins라, 두 파트장이 동시에 편집하면 나중 저장이 앞 변경을 조용히 덮어쓴다. 검토요청 수정에는 0-row 감지 가드가 있는데 이 경로엔 없다. 시스템이 복수 leader를 지원하므로 실재 시나리오.
근거: [src/data/mutations/master.ts:263](../src/data/mutations/master.ts), `updateProject`(projects 뮤테이션).

**목적**
복수 파트장 동시 편집 시 조용한 데이터 유실을 막는다.

**개선 방향**
교체 RPC/프로젝트 update에 낙관적 동시성 검증(기대 목록 또는 `updated_at` 대조) 추가. 단건 추가는 P0-2에서 이미 스냅샷 의존을 제거했으므로 이 항목은 **교체·수정 경로 한정**.

**상세 개선 방법**
- 프로젝트: `projects`에 `updated_at` 활용 → `updateProject` RPC/update에 `.eq('updated_at', expectedUpdatedAt)` 조건 + 0-row 시 "다른 사용자가 먼저 수정했습니다" 안내(P1-2 가드 재사용).
- 배정 교체: `replace_*_assignments`에 파라미터로 기대 현재 목록을 받아 서버에서 대조하거나, 편집 모달 진입 시점의 목록 해시를 검증.

**검증**
두 세션에서 같은 프로젝트를 동시 수정 → 나중 저장이 충돌 안내를 받는지.

**영향·주의**
UX 트레이드오프(충돌 시 사용자 재시도 필요). 10인 규모라 빈도는 낮으므로 P1 후반 우선순위.

---

### P1-8. 헤더 없는 CSV 임포트의 첫 행 유실 수정

**설명**
`parseProductImportRows`/`parseInviteImportRows`는 무조건 `rows[0]`을 헤더로 분리한 뒤, 인식 가능한 헤더 컬럼이 없으면 위치 기반 파싱으로 전환하는데 **이때도 `body`(rows[1..])만 순회해 실제 데이터였던 첫 행을 버린다.** '모델A/모델B/모델C' → 모델A 유실.
근거: [src/lib/csvImport.ts:71-73, 93-99](../src/lib/csvImport.ts).

**목적**
마스터 데이터가 조용히 불완전하게 적재되는 것을 막는다.

**개선 방향**
헤더 미인식 시 `body` 대신 `rows` 전체를 위치 기반으로 파싱. 또는 명시적 오류로 헤더를 요구.

**상세 개선 방법**
`if (indexes.name < 0)` / `if (indexes.email < 0)` 분기에서 `body.map(...)` → `rows.map(...)`로 변경(첫 행 포함). 헤더 라벨('제품명','email')은 이미 `indexes>=0` 분기에서 걸러지므로 안전. 관련 테스트([src/lib/*.test.ts] 또는 csvImport 테스트) 추가: 헤더 없는 입력의 첫 행이 보존되는지.

**검증**
헤더 없는 CSV 임포트 → 모든 행이 적재되는지. 헤더 있는 CSV는 기존대로 헤더 제외.

**영향·주의**
`parseCsvRows`의 CR 전용(`\r`) 개행 미처리(저심각도)도 같은 파일 → P3와 함께 볼 수 있음.

---

### P1-9. .zip 첨부 MIME 불일치로 인한 업로드 실패 (Windows)

**설명**
클라이언트는 확장자로 .zip을 허용하지만, 업로드 시 `contentType`을 지정하지 않아 브라우저가 보고한 `file.type`이 그대로 전송된다. Windows Chrome/Edge는 .zip을 `application/x-zip-compressed`로 보고하는 경우가 흔한데, 버킷 `allowed_mime_types`는 `application/zip`만 허용해 서버가 거부한다. SQA 파트가 Windows 중심이라 .zip 첨부가 사실상 실패할 수 있다.
근거: [src/lib/attachments.ts:8, 49](../src/lib/attachments.ts) (확장자 허용/contentType 미지정), [supabase/migrations/202607050002_review_attachments_storage.sql](../supabase/migrations/202607050002_review_attachments_storage.sql) (버킷 MIME 목록).

**목적**
허용한 파일 형식이 실제로 업로드되게 한다.

**개선 방향**
업로드 시 확장자→표준 MIME를 명시 지정하거나, 버킷 허용 목록에 변종 MIME 추가.

**상세 개선 방법**
- **클라이언트(권장)**: [src/lib/attachments.ts:49](../src/lib/attachments.ts) `upload(path, file, { upsert: false })` → `{ upsert: false, contentType: guessMime(file.name) }`. `guessMime`은 확장자→MIME 매핑(zip→`application/zip`, docx 등). 브라우저 오탐 대신 확장자 기준으로 서버 검증을 통과시킨다.
- **서버(보완)**: 새 마이그레이션으로 버킷 `allowed_mime_types`에 `application/x-zip-compressed` 추가 검토.

**검증**
**Windows 실기**의 Chrome/Edge에서 .zip/.txt/.docx 첨부 업로드를 각각 1회 실측(운영 개시 전 필수).

**영향·주의**
`application/octet-stream`(확장자 없는 파일)까지 허용할지는 보안 트레이드오프 — 팀 정책으로 결정.

---

## 3. P2 — 프런트엔드 버그 · 성능 · 운영 관측성

### P2-1. 초기 프로필/데이터 로드 실패 시 재로그인 복구 불가

**설명**
세션이 살아있을 때 profiles 조회·초기 refresh가 일시적 네트워크 오류로 throw하면 catch가 `setProfile(null)`로 AuthPanel을 띄우는데, 프로필 로드 effect는 `profileEffectKey`(세션 user id)로만 재실행되어 **같은 계정 재로그인 시 key가 안 바뀌어 effect가 재실행되지 않는다.** 새로고침만이 복구 수단. 첫날 사내망이 잠깐 불안정하면 다수가 동시에 겪을 수 있다.
근거: [src/app/hooks/useAuthProfile.ts:63-64, 127-185](../src/app/hooks/useAuthProfile.ts).

**목적**
일시적 네트워크 오류에서 새로고침 없이 자동/수동 복구되게 한다.

**개선 방향**
로드 실패를 별도 상태로 두고 재시도 UI를 제공하거나, `SIGNED_IN` 이벤트에서 (같은 id라도) 재로드를 트리거.

**상세 개선 방법**
- 옵션 A(간단): catch 경로에서 1회 backoff 자동 재시도 후에도 실패하면 명시적 오류 화면(재시도 버튼 → 프로필 로드 재실행) 렌더.
- 옵션 B(구조적): `profileLoadError` 상태 + 재시도 카운터를 `profileEffectKey`에 섞어(`${id}:${retryTick}`) 재시도가 effect를 재실행하게.

**검증**
프로필 로드에서 오류를 강제 주입 → 재시도로 정상 진입하는지. 정상 흐름 회귀 없는지.

**영향·주의**
`profileLoadGenerationRef` 경쟁 가드를 깨지 말 것. 재시도가 중복 refresh를 만들지 않게 generation 검사 유지.

---

### P2-2. 역할 강등·계정 비활성화가 진행 중 세션에 반영되지 않음

**설명**
profile은 세션 부트스트랩 시 1회만 로드되고 이후 갱신은 비밀번호 변경 완료·preview 토글뿐이다. 5분 폴링·수동 새로고침은 AppData만 갱신한다. 그래서 (1) 비활성화된 파트원은 화면이 조용히 비고 안내가 없으며, (2) 강등된 파트장은 세션 내내 leader UI를 유지하며 쓰기가 RLS 오류로 반복 실패, (3) 승격은 재로그인 전까지 미반영.
근거: [src/app/hooks/useAuthProfile.ts:63](../src/app/hooks/useAuthProfile.ts), [src/App.tsx:47-59, 158](../src/App.tsx).

**목적**
권한 변경 직후의 혼란(빈 화면 문의, 반복 오류)을 없앤다.

**개선 방향**
주기 refresh가 받아온 profiles에서 자신의 행으로 profile 상태를 함께 갱신하거나, 폴링 시 `loadProfileForSession`을 재실행해 비활성·강등을 차단 화면/탭 재구성으로 전환.

**상세 개선 방법**
`refreshData`가 반환한 profiles에서 `profile.id` 행을 찾아 `role`/`is_active` 변화 시 `setProfile`로 갱신(→ App.tsx의 게이트가 자동 재평가). 또는 `useBackgroundRefresh` 콜백에서 `loadProfileForSession()`도 호출.

**검증**
파트원 비활성화 후 다음 폴링 → 차단 화면 전환. 파트장 강등 후 → member UI로 재구성.

**영향·주의**
자기 강등/비활성 시 무한 refresh 루프가 안 생기게(비활성 감지 즉시 폴링 중단) 주의. `backgroundSyncEnabled` 조건과 상호작용 확인.

---

### P2-3. 역할 sanitize 해시 재작성을 replaceState로 (뒤로가기 트랩 제거)

**설명**
hashchange 핸들러가 역할에 안 맞는 탭을 `window.location.hash` 대입으로 재작성하는데, 이는 **새 히스토리 엔트리를 push**한다. 파트원이 리더 탭 딥링크를 열면 뒤로가기 → 리더 탭 진입 → 즉시 재작성 push 루프가 되어 히스토리를 통과할 수 없고 계속 불어난다.
근거: [src/app/hooks/useHashNavigation.ts:31-34, 43, 48](../src/app/hooks/useHashNavigation.ts).

**목적**
역할 강등에 의한 자동 재작성이 히스토리를 오염시키지 않게.

**개선 방향**
자동 재작성은 `history.replaceState`(현재 엔트리 교체), 사용자 주도 이동은 기존 push 유지.

**상세 개선 방법**
`syncFromHash`의 `if (safeTab !== tab)` 재작성부(31-34행)를 `window.history.replaceState(null, '', hash)`로 변경. 40-49행의 sanitize effect도 사용자 클릭이 아닌 자동 강등이므로 `setActiveTabState` + `replaceState` 조합으로(‑`setActiveTab`은 push를 유발). `setActiveTab`(사용자 이동)은 그대로.

**검증**
파트원으로 리더 탭 딥링크 진입 → 자동으로 dashboard로 교체되고, 뒤로가기가 정상 동작(루프·히스토리 증식 없음).

**영향·주의**
`resetNavigation`/정상 탭 이동의 push 동작을 깨지 말 것. replaceState는 자동 sanitize 경로에만.

---

### P2-4. 로그아웃 시 lastSyncedAt 미초기화로 재로그인 딥링크 소실

**설명**
App의 딥링크 존재 검증 effect는 `dataReady(= lastSyncedAt != null)`를 게이트로 쓰는데, `useAppData`의 `lastSyncedAt`이 로그아웃 시 초기화되지 않는다. 같은 SPA 수명 내 재로그인 + 딥링크 시 profile은 있고 data는 emptyData인데 stale `lastSyncedAt` 때문에 `dataReady=true`가 되어 "링크 대상을 찾을 수 없습니다" 오탐과 함께 딥링크가 파괴된다.
근거: [src/App.tsx:82-97](../src/App.tsx), `useAppData`의 lastSyncedAt.

**목적**
재로그인 후 딥링크(#/reviews?id=…)가 정상 동작하게.

**개선 방향**
로그아웃 시 lastSyncedAt을 리셋하거나, 딥링크 게이트에 `!initialLoading` 조건 추가.

**상세 개선 방법**
- 옵션 A: `useAppData`에 lastSyncedAt 리셋 함수를 노출하고 `signOut`([useAuthProfile.ts:187](../src/app/hooks/useAuthProfile.ts))에서 호출.
- 옵션 B(간단): [src/App.tsx:82](../src/App.tsx) `dataReady` 조건에 `&& !initialLoading` 추가(초기 로드 완료 전 판정 금지).

**검증**
A 로그아웃 → B가 딥링크 URL로 로그인 → 대상 항목이 정상 선택되고 오탐 경고 없음.

**영향·주의**
정상 "삭제된 딥링크 안내"는 유지되어야 한다(진짜 없는 대상엔 여전히 경고).

---

### P2-5. reviews 탭 체류 중 도착 항목의 unread 배지 미해제

**설명**
`markReviewsSeen`은 `[activeTab, profile]` 변화 시에만 실행된다. reviews 탭에 머무는 동안 폴링/Realtime으로 새 요청이 오면 배지가 켜지는데, 같은 탭 재클릭(동일값 bail-out)·알림 클릭(`onSelect('reviews', id)`가 activeTab 불변)으로는 effect가 재실행되지 않아 배지가 안 꺼진다.
근거: [src/App.tsx:72-78, 126-131](../src/App.tsx).

**목적**
검토 워크스페이스를 열어두는 파트장이 배지 상시 점등에 시달리지 않게.

**개선 방향**
항목 열람 시점·알림 클릭 시점에도 `markReviewsSeen`을 호출.

**상세 개선 방법**
- NotificationPanel `onSelect` 경로에서 `tab==='reviews'`이고 이미 그 탭이면 `markReviewsSeen(profile.id) + setReadTick` 호출.
- 또는 reviews 목록에서 항목 선택 시 항목 단위 읽음 처리.

**검증**
reviews 탭 유지 중 새 요청 도착 → 알림 클릭/항목 열람으로 배지 해제되는지.

**영향·주의**
'모두 읽음'(`markAllNotificationsRead`)과 cutoff 기준점(`reviewsUnreadCutoff`) 로직을 깨지 말 것.

---

### P2-6. review_requests 무제한 전량 로드에 기간/개수 캡 도입

**설명**
`fetchAppData`가 review_requests를 limit 없이 전 행 조회하며 각 행에 review_feedback을 통째로 임베드한다(activity_logs는 limit 100인 것과 대조). 이 전량 로드가 5분 폴링·창 복귀·모든 뮤테이션 후·Realtime INSERT마다 반복된다. 수개월 누적 시 페이로드가 선형 증가하고 egress 비용에 직결(→ P2-14도 참조).
근거: [src/data/fetchAppData.ts:80-86](../src/data/fetchAppData.ts).

**목적**
데이터 누적에 따른 페이로드·비용·파싱 증가를 억제.

**개선 방향**
종결(approved/rejected) 요청에 기간 창 또는 개수 캡. pending은 전량 유지.

**상세 개선 방법**
- pending은 전량, 종결분은 최근 3~6개월(또는 최근 N건)만 기본 로드하고 그 이전은 '이전 요청 보기'로 지연 로드. 월간 통계가 6개월 창을 쓰므로 **6개월 경계가 자연스럽다.**
- 최소 조치: 목록에서 review_feedback 임베드를 빼고 상세 선택 시 요청 단위로 조회.

**검증**
대량 더미 데이터로 로드 페이로드 감소 확인. 통계·목록이 캡 이후에도 정확한지.

**영향·주의**
`buildReviewMonthlyStats`·selector가 "전량"을 가정하지 않는지 점검(캡과 통계 창 정합).

---

### P2-7. ReviewsPanel 리렌더 최적화 (피드백 입력 시 전체 재정렬)

**설명**
feedback 초안 상태가 패널 최상위에 있어 textarea 한 글자마다 `ReviewsPanel` 전체 리렌더 → selector들이 useMemo 없이 매번 전 배열 필터·정렬, ReviewList/Kanban이 React.memo 없이 전량 리렌더. P2-6의 무제한 로드와 결합 시 타이핑 지연으로 먼저 체감된다.
근거: [src/screens/ReviewsPanel.tsx:52](../src/screens/ReviewsPanel.tsx).

**목적**
데이터 누적 시 파트장 피드백 작성 경험이 나빠지는 것을 막는다.

**개선 방향**
초안 상태를 하위 컴포넌트로 내리고, selector 메모이즈 + 목록 컴포넌트 memo화.

**상세 개선 방법**
1. feedback 초안을 선택된 `ReviewRequestItem` 내부 로컬 상태로 이동, 저장 시에만 상위 전달 → 키 입력이 목록 리렌더를 유발하지 않음.
2. `selectScopedReviewRequests`/`selectVisibleReviewRequests` 결과를 `useMemo(data, profile, statusFilter)`로 감싸기.
3. `ReviewList`/`ReviewKanban`/`ReviewDetail`을 `React.memo`.

**검증**
React Profiler(또는 렌더 카운트 로그)로 타이핑 중 목록 리렌더가 사라졌는지.

**영향·주의**
P2-6(캡)이 들어가면 시급성은 낮아진다. 리렌더 최적화가 선택/딥링크 동작을 깨지 않게 회귀 테스트([src/screens/ReviewsPanel.test.tsx]) 확인.

---

### P2-8. 장애·백업 실패 능동 알림 채널 신설

**설명**
장애 감지가 전부 수동이다(앱 다운=사용자 접속 실패, 백업 실패=주 1회 육안 확인). 특히 GitHub는 저장소 활동이 없으면 schedule 워크플로를 자동 비활성화할 수 있어 백업이 red run도 없이 **조용히 중단**될 수 있다.
근거: [docs/OPERATIONS.md:29](OPERATIONS.md), [.github/workflows/backup.yml](../.github/workflows/backup.yml).

**목적**
유일한 복구 수단(백업)의 중단과 앱 다운을 사람이 늦지 않게 인지.

**개선 방향**
무료 범위의 최소 관측성 2종.

**상세 개선 방법**
1. 외부 무료 업타임 모니터(UptimeRobot 등)로 `WORKER_URL` 감시 → 파트장 메일 알림.
2. backup.yml 마지막에 `if: failure()` 스텝으로 이슈 자동 생성(`actions/github-script`) 또는 메일/웹훅.
3. 주간 루틴에 "백업 run이 최근 8일 내 존재하는지" 확인을 추가(schedule 자동 비활성화 감지). Phase 2 알림 채널 결정 시 운영 알림을 같은 채널에.

**검증**
백업을 일부러 실패시켜 알림이 오는지. 업타임 모니터가 다운 감지·통지하는지.

**영향·주의**
알림 채널에 secret·개인정보가 실리지 않게(로그 노출 주의).

---

### P2-9. 배포 후 자동 헬스체크

**설명**
`deploy-worker.yml`은 `wrangler deploy` 종료 코드만으로 "Deploy succeeded"를 기록한다. anon key 미갱신·URL 오타로 빌드가 틀려도 배포는 green이고 사용자는 설정 오류 화면을 만난다. config guard는 값 '존재'만 검사한다. 알림 패키지 스모크 5항목도 미수행.
근거: [.github/workflows/deploy-worker.yml:106](../.github/workflows/deploy-worker.yml).

**목적**
"배포 성공"이 "앱 정상"을 실제로 의미하게.

**개선 방향**
배포 후 최소 헬스체크 스텝 + 파트장 1분 스모크 문서화.

**상세 개선 방법**
`WORKER_URL`을 repo Variable로 등록하고 deploy 뒤에:
```bash
curl -sf "$WORKER_URL" | grep -q 'id="root"'   # 루트 마운트 확인
curl -sI "$WORKER_URL" | grep -qi 'content-security-policy'  # 보안 헤더 확인
```
실패 시 워크플로 실패 처리. 배포 직후 파트장 "로그인 1회" 스모크를 배포 루틴으로 문서화하고, 밀린 알림·동기화 스모크 5항목을 이번 주 내 수행·기록.

**검증**
일부러 잘못된 env로 배포 → 헬스체크가 실패를 잡는지.

**영향·주의**
헬스체크가 인증 없이 접근 가능한 정적 응답만 검사하도록(로그인 필요 페이지 아님).

---

### P2-10. 운영 DB '실전 복원' 런북 작성

**설명**
OPERATIONS.md 복구 절차는 '테스트용 빈 프로젝트에 schema→data 적용'만 다룬다. 실제 재해(운영 DB 손상)에서는 (a) 기존 프로젝트에 psql을 흘리면 충돌, (b) 신규 프로젝트 전환 시 PROJECT_REF·URL·anon key가 전부 바뀌어 GitHub Variables/Secrets 갱신 → 재배포 → Auth 설정 재적용 → 별도 승인된 break-glass 마이그레이션 이력 repair까지 필요한데 이 총 절차가 없다.
근거: [docs/OPERATIONS.md:124](OPERATIONS.md), [docs/DEPLOYMENT.md](DEPLOYMENT.md) (롤백 절이 리허설 절차를 가리킴).

**목적**
재해 시 당황 없이 따라갈 수 있는 완결된 복원 절차 확보.

**개선 방향**
"운영 복원 런북" 절 신설 + 다음 리허설에서 전환 구간 1회 실연.

**상세 개선 방법**
OPERATIONS.md에 순서 기록: 신규 프로젝트 생성(서울 리전) → 백업 복호화·복원 → Auth 설정 재적용 체크리스트(disable_signup, Site URL, 비밀번호 정책=P0-1) → GitHub Variables/Secrets 3종 교체(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`) → Deploy Worker 재실행 → 별도 승인된 break-glass 절차에서만 마이그레이션 이력 repair(`--status applied`).

**검증**
다음 분기 리허설에서 최소한 Variables 교체→재배포 구간을 실연하고 소요·이슈 기록.

**영향·주의**
문서 작업이지만 P0-1(비밀번호 정책)·P0-3(백업)과 상호 참조. 링크 정합 유지.

---

### P2-11. 첨부 백업 제외(B안) 팀 공지 완료

**설명**
B안(첨부 버킷을 어떤 백업에도 포함 안 함)은 "중요 문서 원본은 작성자가 보관"을 전제로 성립하는데, 그 전제를 만드는 팀 공지가 미완이다. 공지 없이 사용이 시작되면 사용자가 "첨부는 백업된다"고 가정해 원본을 지울 수 있고, Storage 사고 시 파일이 어디에도 없다 → '수용한 위험'이 아니라 '고지 안 된 데이터 손실'.
근거: [docs/OPERATIONS.md:90](OPERATIONS.md).

**목적**
리스크 수용의 전제(사용자 인지)를 실제로 성립시킨다.

**개선 방향**
온보딩 전 1회 공지 + 앱 내 상시 안내.

**상세 개선 방법**
개인정보 공지와 묶어 1회 공지하고 일자를 OPERATIONS.md/팀 위키에 기록. Phase 1 USER_GUIDE에 "첨부는 백업되지 않음 — 원본 별도 보관"을 필수 항목으로. 가능하면 첨부 업로드 UI([ReviewsPanel]의 첨부 영역)에 같은 안내 문구 노출.

**검증**
공지 일자 기록. UI 안내 문구 노출 확인.

**영향·주의**
UI 문구 추가 시 DESIGN.md 토큰 준수.

---

### P2-12. CI/배포 파이프라인에 RLS 테스트 편입

**설명**
'RLS가 권한의 원천'인데 `tests/rls/`는 로컬 Supabase env 게이트로 CI·배포에서 **항상 skip**된다. ci.yml·deploy-worker.yml에 `supabase start`가 없어 `npm test`가 RLS 테스트를 조용히 건너뛰고 초록불을 낸다. 마이그레이션 30개가 정책을 계속 덮어써 온 이력을 감안하면, 정책 변경이 기존 차단을 깨뜨려도 배포 전 잡히지 않는다 — **초록불 착시.**
근거: [.github/workflows/ci.yml](../.github/workflows/ci.yml), [tests/rls/helpers.ts:7-16](../tests/rls/helpers.ts) (env 게이트).

**목적**
권한의 원천(RLS)을 자동 회귀로 보호.

**개선 방향**
CI에 로컬 Supabase 기동 + 마이그레이션 적용 + RLS 테스트 job 추가, 배포 게이트에 포함.

**상세 개선 방법**
ci.yml에 별도 job: `supabase/setup-cli` → `supabase start` → 마이그레이션 적용 → `SUPABASE_URL=http://127.0.0.1:54321` 등 env 설정 후 `npx vitest run tests/rls`. deploy-worker의 배포 전 게이트에 이 job을 `needs`로 연결. 당장 어려우면 최소한 "RLS 테스트가 skip되면 워크플로에 경고 표기".

**검증**
정책을 일부러 약화한 브랜치에서 RLS 테스트가 red가 되는지.

**영향·주의**
CI 시간 증가(로컬 스택 기동). P3-7(actions SHA 핀)·P3-8(permissions)과 같은 워크플로 파일을 건드리므로 함께 처리 효율적.

---

### P2-13. 원격(Supabase) 쓰기 경로 계약 테스트

**설명**
데이터 계층 테스트는 전부 데모(local) 분기만 검증하고, `supabaseReviewRepository`·`supabaseProjectRepository`·`supabaseMasterRepository`와 master.ts 원격 인라인 분기는 단위 테스트가 없다. 오늘 배포된 실제 쓰기 경로(RPC 파라미터 매핑, 0-row 가드, 첨부 정리 순서)가 회귀 가드 없이 수동 검증에만 의존한다.
근거: [src/data/mutations/master.test.ts:6](../src/data/mutations/master.test.ts) (demo만), ARCHITECTURE.md 테스트 지도가 실제보다 낙관적.

**목적**
원격 쓰기 경로의 파라미터·가드·순서를 회귀로 고정.

**개선 방향**
supabase 클라이언트를 목킹한 계약 테스트.

**상세 개선 방법**
`supabase` 모듈을 vitest로 목킹해 원격 repository 3종의 (a) 호출 RPC 이름·파라미터, (b) 0-row 시 `UserFacingError`(P1-2), (c) 첨부 정리 순서(`removeReviewAttachment` 호출 시점)를 assert. P2-12(로컬 Supabase 통합 테스트)와 상호 보완(계약=단위, RLS=통합).

**검증**
새 테스트가 통과하고, P1-2 가드 회귀 시 red가 되는지.

**영향·주의**
목킹이 실제 Supabase 동작과 어긋나지 않게 P2-12 통합 테스트로 교차 확인.

---

## 4. P3 — 하드닝 · 품질 · 저심각도

### P3-1. CSP `connect-src` 와일드카드 한정 + `style-src 'unsafe-inline'` 검토
- **설명/근거**: [public/_headers:6](../public/_headers)의 `connect-src`가 `https://*.supabase.co wss://*.supabase.co` 전체 허용. 누구나 만들 수 있는 supabase.co 하위 도메인이라 XSS 성립 시 공격자 프로젝트로 유출 채널이 됨. `style-src 'unsafe-inline'` 잔존.
- **개선 방법**: `connect-src`를 실제 프로젝트 호스트(`https://<project-ref>.supabase.co`, `wss://<project-ref>.supabase.co`)로 한정. 컴포넌트가 inline `style` 속성만 쓰는지 확인 후 가능하면 `'unsafe-inline'` 제거, 어려우면 문서화.
- **검증**: 배포 후 정상 동작(Supabase 통신 차단 안 됨) + CSP 헤더 값 확인.

### P3-2. HSTS 헤더 추가
- **설명/근거**: [public/_headers](../public/_headers)에 다른 보안 헤더는 있으나 `Strict-Transport-Security` 없음.
- **개선 방법**: 우선 `Strict-Transport-Security: max-age=31536000`을 추가했다. `includeSubDomains`/preload는 모든 하위 호스트의 HTTPS 제공을 확인한 뒤 별도 운영 승인으로 적용한다.

### P3-3. GitHub Actions 서드파티 액션 commit SHA 핀 고정
- **설명/근거**: DB 전체 권한(`SUPABASE_DB_URL`)을 다루는 [db-migrate.yml:46](../.github/workflows/db-migrate.yml)·backup.yml이 `@v1`/`@v4` 가변 태그 참조. 태그 이동 시 secret 유출 위험.
- **개선 방법**: `supabase/setup-cli`, `actions/checkout`, `actions/upload-artifact` 등을 commit SHA로 핀(`@<sha> # v1.x`). Dependabot으로 갱신. db-migrate.yml·backup.yml부터.

### P3-4. ci.yml `permissions: contents: read` 추가
- **설명/근거**: 다른 워크플로는 최소 권한을 명시하는데 [ci.yml](../.github/workflows/ci.yml)만 없음. 기본 토큰이 read-write면 `npm ci` postinstall이 쓰기 토큰으로 실행.
- **개선 방법**: ci.yml 최상위에 `permissions: contents: read` 추가.

### P3-5. 백업 암호화를 AEAD로 (무결성 검증)
- **설명/근거**: [backup.yml:68](../.github/workflows/backup.yml)이 `openssl enc -aes-256-cbc`(인증 없음). 기밀성은 확보되나 변조 탐지 불가.
- **개선 방법**: `age`(권장) 또는 `gpg --symmetric`(AES256, MDC)로 교체하거나, 최소한 암호화 파일 sha256을 step summary에 기록해 복원 시 대조.

### P3-6. 문서화되지 않은 계층 규칙 위반 정리
- **설명/근거**: ARCHITECTURE.md는 "lib 순수 유틸", "화면은 src/data만 호출"이라지만 [src/lib/attachments.ts](../src/lib/attachments.ts)가 스토리지 I/O, [src/lib/activityLog.ts](../src/lib/activityLog.ts)가 DB insert를 하고, [src/screens/ReviewsPanel.tsx:15](../src/screens/ReviewsPanel.tsx)가 스토리지 쓰기를 data 계층 밖에서 실행. '알려진 부채' 목록에 미기재.
- **개선 방법**: 첨부 업로드/삭제를 `ReviewRepository`로 이관해 화면에서 스토리지 접근 제거, 또는 최소한 ARCHITECTURE.md '알려진 부채'에 명시하고 attachments/activityLog를 lib '순수 유틸' 서술과 분리. AuthPanel·PasswordChangePanel의 supabase 직접 import(인증이라 실질 위험 낮음)는 예외로 문서화.

### P3-7. `handle_new_user` 이메일 선점 권한 상승 점검
- **설명/근거**: `handle_new_user`가 이메일 일치만으로 초대 역할을 자동 부여([supabase/migrations](../supabase/migrations) 관련 트리거). Auth signup이 열려 있으면 이메일 선점 등록으로 권한 상승 가능(현재 signup 잠금 설정에 의존).
- **개선 방법**: Supabase Auth의 `disable_signup=true`가 실제 설정됐는지 확인·문서화(OPERATIONS.md). 초대 흐름을 대시보드 계정 생성 전용으로 유지. 클라이언트에 self-service signup 경로가 없음을 회귀로 고정.

### P3-8. lint 경고 0 유지 (useAuthProfile exhaustive-deps)
- **설명/근거**: [src/app/hooks/useAuthProfile.ts:185](../src/app/hooks/useAuthProfile.ts)의 effect가 exhaustive-deps 경고 1건(의도적 패턴이나 억제 주석 부재). 방치하면 새 경고가 묻힌다.
- **개선 방법**: 해당 배열 줄에 `// eslint-disable-next-line react-hooks/exhaustive-deps` + "sessionUser 정체성 churn(TOKEN_REFRESHED) 시 재실행 방지 위해 profileEffectKey로 축약" 의도 주석. **`sessionUser`를 의존성에 그대로 추가하지 말 것**(토큰 갱신마다 전체 리로드 회귀).

### P3-9. `reviewPriorityScore` 상태 버킷 겹침
- **설명/근거**: [src/lib/priority.ts](../src/lib/priority.ts)에서 마감 지난 '완료(approved)'가 '반려(rejected)'보다 위로 정렬됨(상태 버킷 점수 겹침).
- **개선 방법**: 상태별 기본 점수 구간이 겹치지 않게 버킷 분리. 테스트([src/lib/priority.test.ts](../src/lib/priority.test.ts))로 정렬 순서 고정.

### P3-10. 번들 코드 스플리팅 (선택)
- **설명/근거**: 단일 JS 청크 529KB(gzip 145KB), Vite 500KB 경고. 10인 도구엔 당장 무해하나 의존성 증가 시 초기 로드 증가.
- **개선 방법**: vite.config에서 vendor 수동 청크(`@supabase/supabase-js`, `lucide-react`) 분리 또는 대형 화면 dynamic import. 현 규모를 수용한다면 `build.chunkSizeWarningLimit` 상향으로 경고 노이즈 제거(0-warning 유지).

### P3-11. 기타 저심각도 관찰 (일괄 백로그)
아래는 미검증(저심각도) 관찰로, 여유 시 확인·처리. 각 항목은 근거 파일에서 재확인 후 착수:
- **초기 로드 타임아웃 부재**: `fetchAppData`에 타임아웃이 없어 네트워크 행 시 무한 로딩 가능 → `withTimeout` 적용 검토.
- **CR 전용(`\r`) 개행 미처리**: [src/lib/csvImport.ts:43](../src/lib/csvImport.ts)의 `parseCsvRows`가 lone `\r`를 행 구분자로 처리 안 함 → 구형 Mac CSV가 한 행으로 병합. (P1-8과 같은 파일)
- **데스크톱 알림 컷오프 strict 비교**: 같은 밀리초 생성 요청이 영구 누락 가능 → `>` 를 `>=`로 검토.
- **team 딥링크 검증 기준 불일치**: 존재 검증은 전체 profiles, TeamPanel 소비는 member만.
- **인증 부트스트랩 타임아웃이 유효 세션 signOut**: [useAuthProfile.ts:81-90](../src/app/hooks/useAuthProfile.ts) 8~10초 타임아웃이 느린 네트워크의 유효 세션을 파기.
- **활동 로그 local/remote 보존 불일치**: 로컬은 40건 절단([activityLog.ts:44](../src/lib/activityLog.ts)), 원격 조회는 100건([fetchAppData.ts:112](../src/data/fetchAppData.ts)).
- **'대기중' 상태 버튼 dead UI**: 항상 비활성.
- **검토요청 작성 화면 '검토 대상' 표기가 첫 leader 고정**(복수 파트장 시).
- **Supabase Free egress(월 5GB)·7일 무활동 pause**: P2-6 캡으로 egress 완화, pause는 일일 백업·모니터로 활동 유지(P0-3·P2-8과 연계).

---

## 5. 실행 순서 · 의존 관계

```
P0-1 (비밀번호)  ─ 독립, 최우선. (d)는 새 마이그레이션.
P0-2 (add-only)  ─ 독립, 새 마이그레이션. P1-1·P1-7의 전제(단건/교체 분리).
P0-3 (백업)      ─ 독립(워크플로·문서).
P0-4 (이중배포)  ─ 독립(대시보드·문서).

P1-2 (0-row)  →  P1-3 (배정 로그: 0-row 통과 후 기록)  →  P1-4 (서버 로그)
P1-1 (배정 UI)   ─ P0-2 이후. saveXAssignments export가 시작점.
P1-5 (재오픈)    ─ 독립, 새 마이그레이션.
P1-6 (소프트삭제)─ 가장 큰 스키마 변경. 별도 PR. 데이터 쌓이기 전이 유리.
P1-7 (동시성)    ─ P0-2·P1-1 이후.
P1-8 (CSV)·P1-9(zip) ─ 독립 소규모.

P2-6 (로드 캡)  →  P2-7 (리렌더)  ── 캡이 먼저면 리렌더 시급성↓
P2-12 (CI RLS) + P3-3/P3-4 (워크플로 하드닝)  ── 같은 파일군, 함께 처리
P2-13 (계약 테스트) ─ P1-2 가드 이후(가드를 테스트로 고정)
```

**한 스프린트 권장 묶음**
- 스프린트 A(즉시): P0-1, P0-2, P0-3, P0-4
- 스프린트 B: P1-1, P1-2, P1-3, P1-8, P1-9 + P2-3, P2-4, P2-5 (프런트 소규모 버그 묶음)
- 스프린트 C: P1-4, P1-5, P2-1, P2-2, P2-12 + P3-1~P3-4 (보안/관측성 하드닝)
- 스프린트 D: P1-6, P1-7, P2-6, P2-7, P2-13 (구조 변경)
- 상시: P2-8~P2-11(운영 문서/관측성), P3-5~P3-11

---

## 6. 전역 검증 체크리스트 (모든 PR 공통)

- [ ] `npm run typecheck` 0 errors
- [ ] Migrations `202607110007` through `202607110011` are applied before the frontend and the project-assignment OCC, review-reopen, direct-write closure, transactional review-activity, and profile-note private-audit paths are verified
- [ ] P0-1 coordinated rollout raises the login-form minimum and removes the standalone `mark_password_changed()` bypass
- [ ] `npm run lint` 0 errors, **새 경고 0** (P3-8)
- [ ] `npx vitest run` 전부 통과(watch 금지)
- [ ] `npm run build` 성공
- [ ] DB 변경 시: 기존 마이그레이션 **불변**, 새 파일 추가, `src/migrations.test.ts` 갱신, 로컬 Supabase에서 `tests/rls/` 통과
- [ ] 데이터 계층 변경 시: local·remote **양쪽** 수정, 등가성 유지, 데모 모드 수동 확인
- [ ] RLS 변경 시: `src/domain/permissions.ts` 거울·`permissions.test.ts` 동기화
- [ ] UI 변경 시: DESIGN.md 토큰만 사용, `src/styles.css`에만 스타일
- [ ] 외부로 나가는/되돌리기 어려운 변경(배포·마이그레이션·삭제)은 실행 전 근거 재확인, 롤백 경로 확보

---

*이 계획서는 2026-07-11 검토 시점의 코드를 기준으로 한다. 파일·줄 번호는 착수 시 재확인할 것(코드가 이동했을 수 있음). 각 항목의 원본 지적 근거는 코드 인용으로 본문에 포함되어 있다.*

---

## 7. Codex 추가 검토 보정 (2026-07-11)

이 절은 원 계획을 실제 코드·테스트·공식 문서·독립 리뷰와 대조한 결과다. 본문의 우선순위 방향은 유지하되 아래 보정을 적용한다.

### 7.1 계획 전제 보정

- **P0-1**: HTML `minLength=4`는 운영 Supabase의 서버 최소 길이가 4라는 증거가 아니다. 유출 비밀번호 보호는 현재 Supabase Pro 이상 기능이다. `auth.users.encrypted_password` 변경 트리거도 bcrypt 재해시 때문에 “다른 비밀번호로 변경” 자체를 증명하지 못한다. 기존 `mark_password_changed()` 실행권 회수는 대체 서버 흐름과 Auth 통합 테스트를 같은 배포 단위로 준비한 뒤 진행한다.
- **P0-4**: main `0b112c60`에서는 Cloudflare Workers Builds와 GitHub Actions가 함께 실행됐지만, PR #3 종료·disconnect 뒤 probe `ed3c5cb0`에는 GitHub Actions checks만 존재했다. 행동 증거상 Git 연동 해제는 완료됐으며 stale 원격 branch 정리만 남았다.
- **P1-3/P1-4**: `entityType='invite'`가 아니라 DB 허용값은 `allowed_user`다. 일부 RPC 내부에 로그 insert만 추가해도 leader의 직접 테이블 DML과 client 로그 insert가 남으면 authoritative audit가 되지 않는다. 직접 DML 차단 또는 table trigger 감사 설계를 함께 검토한다.
- **P2-12**: 단순 URL env가 아니라 `supabase/config.toml`, Admin API Auth fixture, 데이터 seed, `RLS_REQUIRED=1` fail-closed runner를 구성했다. CI와 Deploy Worker 각각의 로컬 Supabase job이 배포/build의 `needs` gate가 된다. 로컬 PC에는 Docker가 없어 실제 container 실행 증거는 아직 없다.
- **P3-1/P3-2**: 실제 Supabase project-ref를 `_headers`에 커밋하면 운영 식별자 비커밋 정책과 충돌한다. 배포 시 생성 방식이 필요하다. HSTS `includeSubDomains`는 모든 서브도메인의 HTTPS 보장 확인 뒤 적용한다.

### 7.2 원 계획에 없던 고위험 항목

- `workflow_dispatch`는 실행 ref를 선택할 수 있는데 기존 Deploy Worker와 DB Migrate가 `main`을 강제하지 않았다. 비-main ref가 운영 Worker/DB에 도달하지 못하도록 두 workflow 첫 단계에 fail-closed branch guard를 추가했고, Deploy Worker는 `main` push 자동 배포를 제거해 `workflow_dispatch` + `deploy_confirm=true`만 허용한다.
- `public_leader_profiles` owner view의 비활성·비밀번호 미변경 authenticated 노출은 `202607110003`에서 `can_use_app()` gate로 보정했다.
- 마지막 active leader 보호 trigger의 동시 비활성화 race는 `202607110006`의 공통 advisory transaction lock으로 직렬화했다.

### 7.3 현재 로컬 브랜치에서 구현·검증한 범위

- P0-1 일부: 공개 로그인 화면 노출 제거, 운영 절차를 계정별 16자 이상 무작위 임시 비밀번호·정책 하향 금지로 전환. `mark_password_changed()`의 서버 연계 우회는 여전히 별도 coordinated rollout이 필요하다.
- P0-3/P0-4: 매일 05:00 KST 백업, 동일 SHA 사전 백업 gate, GPG 기본+legacy 전환 백업 자체 복호화 검사, 실패 issue 알림, Workers Builds disconnect 증거 기록.
- P0-2: role·active 검증 add-only 단건 배정 RPC와 stale snapshot 의존 제거. P1-1 배정 편집 UI는 기존 전체교체 RPC의 lost-update·비활성 배정 재삽입 문제가 해결되지 않아 이번 배포 후보에서 제외했다.
- P1-2: master/project update·delete의 원격 0-row guard와 로컬 missing-record 등가 오류.
- P1-4/P1-5 일부: review status 직접 UPDATE를 막고 검증 RPC만 허용하며, `202607110010`에서 승인·반려·피드백 생성의 public activity log도 mutation과 같은 트랜잭션으로 기록하고, private trigger audit table에 committed 상태 전이를 기록한다. 종결 요청 재오픈은 leader-only `202607110008` RPC와 UI 확인 단계, feedback 작성자 본인 수정/삭제 UI까지 추가했다. `202607110009`는 password-gated member direct write와 project assignment direct DML을 닫고 OCC revision trigger를 추가했지만, 실제 RLS 환경 검증은 남아 있다.
- P1-8/P1-9: headerless CSV 첫 행·CR-only 처리, 모호한 다열 headerless 제품 CSV 거부, 첨부 표준 MIME 지정.
- P2-1~P2-5: 프로필 로드 재시도, 역할·활성 상태 동기화, 자동 hash sanitize의 replaceState, 로그아웃 sync reset, reviews 재선택 읽음 처리.
- P2-6 일부: 종결 검토요청을 최근 6개월로 제한하고 pending은 유지하며, 겹치는 status 조회는 `updated_at` 최신 행을 선택한다. 6개월 이전 종결 요청은 기존 deep link에서 on-demand 단건 조회해 목록에 병합하므로 재오픈·상세 접근 경로를 보존한다. feedback 임베드 지연 로드와 대량 pending 상한은 아직 남아 있다.
- P2-7 구현: feedback draft를 `ReviewRequestItem` 내부 state로 이동해 타이핑마다 `ReviewsPanel`의 selector·목록 계층이 다시 계산되지 않도록 했고, 정확한 comment 전달 회귀 테스트를 추가했다.
- P2-9~P2-13 일부/완료: Supabase 설정 preflight, Worker root·보안헤더 healthcheck, 신규 프로젝트 전환 런북, 첨부 비백업 UI 고지, 결정적 RLS CI/deploy gate, review 원격 계약·첨부 정리 순서 테스트.
- P3-3~P3-5/P3-8~P3-10 및 추가 하드닝: Action full-SHA pin, 정확한 Wrangler lock, CI 최소 권한, GPG 백업 전환, lint 경고 제거, 상태 점수 버킷 분리, bundle budget, 운영 workflow main guard.

검증 기준선: typecheck/lint/build와 Vitest를 반복 실행한다. `npm run test:rls`는 Supabase env가 없으면 의도대로 red가 되며 더는 skip-green이 아니다. 로컬 PC에는 Docker가 없어 fixture 기반 RLS 통합 성공은 GitHub runner에서 아직 증명되지 않았으므로 **운영 배포·원격 DB migration은 수행하지 않았다.**

### 7.4 운영 무영향 원칙과 2단계 릴리스 게이트

- 프로젝트 배정 전체 교체는 `202607110007`의 `updated_at` OCC RPC와 반환된 새 revision 반영까지 구현·단위 검증했다. 기존 제품·업무 전체 교체 RPC는 구버전 UI 롤백 호환 때문에 인증 실행권을 유지하므로, 새 프런트 전환 후 별도 migration에서 회수한다.

- 현재 변경은 `codex/improvement-hardening` 로컬 브랜치에만 두며, 검증 완료 전 `main` push·Worker 배포·운영 DB migration을 하지 않는다.
- 새 프런트는 `add_product_assignment`/`add_duty_assignment` RPC를 사용하므로 한 번에 합치면 자동 Worker 배포가 DB migration보다 먼저 끝날 수 있다.
- Deploy Worker에도 신규 migration 버전·RPC 존재/실행권한 readiness gate를 두어, 순서를 잘못 합쳐도 DB가 준비되지 않은 프런트는 배포하지 않는다.
- 실제 릴리스는 반드시 **(1) migration-only 변경 반영 → 직전 백업 → DB Migrate → migration version·함수 존재·SECURITY DEFINER·고정 search_path·authenticated/anon ACL·실제 RLS 호출 검증 → (2) 프런트 변경 반영 및 Worker 배포** 순서로 분리한다.
- P1-1 전체 배정 편집은 서버 현재목록 대조 또는 revision 기반 optimistic concurrency, role 검증, 기존 inactive 배정 처리까지 갖춘 별도 변경으로 진행한다.
- 추가 로컬 parity 보강: preview에서도 활성 파트장·활성 member·요청자 소유권·마지막 활성 파트장 규칙을 원격 RLS와 동일하게 적용하고, assignment ID 중복을 제거한다. 오래된 review deep link는 capped refresh 뒤에도 선택 snapshot을 유지한다.
- 소규모 사내 운영 승인 기준은 [docs/RELEASE_EVIDENCE.md](RELEASE_EVIDENCE.md)의 **필수 출시 게이트**와 파트장 1인 승인이다. 선택 운영 개선의 미체크 항목은 출시를 막지 않지만, 필수 항목이 남아 있으면 **keep isolated / do not deploy**를 유지한다.
