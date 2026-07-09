# 배포 전 최종 리뷰 결과

- 검토일: 2026-07-08 / 기준 커밋: `4f7a859`
- 검토 범위: 보안·RLS·인증 / 버그·정합성 / 운영 문서·규정 / UX·UI (실제 앱 구동)
- 검토 방식: 마이그레이션 28개 전수, `src/` 데이터·훅·lib 계층 정독, 데모 모드 실제 구동
- 기준선: typecheck 통과, 테스트 129 통과, lint 0 error(경고 7), 프로덕션 빌드 성공(gzip 76KB)

> 아래 모든 항목은 코드·SQL을 직접 열어 확인했다. "확인 필요"로 표시한 3건만 예외다.

## 조치 현황 (2026-07-08 반영)

리뷰 후 **P0·P1·P2 전부 수정 완료**. 수정 후 typecheck 통과, 테스트 130 통과(+1: 신규 마이그레이션 회귀 테스트), lint 0 error.

- **P0-1 (비밀번호)**: 파트장 결정에 따라 임시 비밀번호 `1234`는 **유지**하되, `must_change_password`를 **RLS로 서버 강제**(신규 마이그레이션 `202607080001`). 비밀번호 변경 전에는 세션이 있어도 데이터 접근 불가. 잔여 위험(공통 1234 선점 변경)은 "한 명씩 즉시 온보딩 + public sign-up OFF"로 운영 완화 — OPERATIONS.md에 명시.
- **P0-2 (sign-up OFF)**: 코드로 강제 불가. 배포 게이트 체크리스트의 hard-blocker로 유지(MANUAL 작업 D).
- **P0-3 (재진입/중복)**: `useMutationRunner`에 in-flight 가드 추가(operation+refresh 전 구간). 더블클릭·연타로 중복 생성 불가.
- **P0-4 (사용자 삭제)**: 정책을 "비활성화 우선, 보존 1년 후에만 삭제"로 확정. 삭제 시 이력 cascade와 leader 삭제 실패를 OPERATIONS.md에 경고로 명시.
- **P1**: refresh 실패와 operation 성공 분리(P1-1), 수동 새로고침 실패 토스트(P1-2), refresh 세대 가드(P1-3), 첨부 고아 정리(P1-4), 통계 월 경계 KST(P1-5), 데모 대분류 삭제 가드(P1-6), 파트장 이름 view 복구(P1-7, `202607080001`). 문서 항목(P1-8~15)은 OPERATIONS·MANUAL·DEPLOYMENT·SUPABASE_MIGRATIONS에 반영.
- **P2**: 첨부 href `javascript:` 차단(normalizeHttpUrl 적용), CSP `object-src`/`base-uri`/`form-action` 추가, `count_active_leaders_except` anon revoke, 원격 편집·회수 0행 매치 오류화, CSV 파일 내 중복 dedupe+건수 안내, 피드백 임베드 정렬, 마감 퀵칩 클릭 시점 계산, readState setItem try/catch, 미확인 뱃지 자기 이벤트 제외, 반려 시 피드백 포커스, 프로젝트 검색창 중복 제거, 데모 정합성(반려 updated_at·초대 import·데모 첨부).

**미조치 1건 (수용)**: `activity_logs`에 member가 자기 명의(`actor_id=self`, `target_user_id=null`)로 임의 로그를 삽입할 수 있는 점(감사 로그 오염)은 그대로 둔다. 타인 사칭·수정·삭제는 불가(append-only)해 위험이 낮고, 이를 막으려면 모든 뮤테이션의 로그 삽입을 SECURITY DEFINER RPC로 옮기는 큰 변경이 필요해 비용 대비 효과가 낮다. 향후 감사 요구가 생기면 그때 RPC 경유로 좁힌다.

**배포 후 확인 필요 3건**(코드로 확인 불가)은 아래 "배포 후 즉시 확인 필요"에 그대로 유효하다.

---

## P0 — 배포 차단. 반드시 먼저 조치

### P0-1. 공통 임시 비밀번호 `1234` 노출 + `must_change_password` 서버 미강제

- **근거**: [`src/screens/AuthPanel.tsx:44`](../src/screens/AuthPanel.tsx) — 로그인 화면이 누구에게나 "최초 비밀번호는 1234"를 노출. [`src/App.tsx:75`](../src/App.tsx) — 비밀번호 변경 화면은 **렌더 분기일 뿐**. `must_change_password`는 마이그레이션 전체에서 컬럼 정의(`202607020001:13`)와 해제 RPC(`202607040001`)에만 등장하고, **어떤 RLS 정책도 참조하지 않는다.**
- **시나리오**: 사내 이메일 규칙은 추정 가능하다. 공격자가 `동료이메일 + 1234`로 로그인 → 대상이 아직 비밀번호를 바꾸지 않았다면 유효 세션 획득 → 비밀번호 변경 화면을 무시하고 anon key + 세션 토큰으로 REST/RPC를 직접 호출해 **그 사용자 권한의 모든 데이터를 조회·조작**. 대상이 파트장이면 팀 전체 데이터 장악. 온보딩 시점에 10개 계정이 동시에 이 상태다.
- **조치**: ① AuthPanel과 README·MANUAL의 `1234` 문구 제거, ② 계정별 **랜덤 임시 비밀번호**를 Dashboard Add user로 개별 발급·개별 전달, ③ (권장) 민감 쓰기 RLS 정책에 `must_change_password = false` 조건 추가.

### P0-2. Supabase public sign-up OFF 미확인 — 초대 이메일 선점 가입

- **근거**: [`docs/OPERATIONS.md:36`](./OPERATIONS.md)이 "1차 probe 가입 성공(ON) … OFF 필요"라고 기록 — 아직 미확정. [`202607020001:176-207`](../supabase/migrations/202607020001_initial_schema.sql) `handle_new_user`(SECURITY DEFINER)는 가입 이메일이 `allowed_users`에 있으면 **그 role 그대로** `profiles`를 자동 생성한다.
- **시나리오**: sign-up이 ON이면, 초대 목록에 등록됐지만 아직 계정을 만들지 않은 동료의 이메일로 공격자가 **먼저 자가 가입**한다. 공격자가 정한 비밀번호로 그 이메일의 프로필(초대된 역할, 파트장 가능)을 획득. `1234`조차 필요 없다.
- **완화 사실**: 초대되지 않은 임의 이메일 가입은 `profiles`가 안 생겨 `can_use_app()=false` → 무해. 위험은 "초대된 미가입 이메일 선점"에 한정.
- **조치**: 배포 전 Dashboard에서 **Enable email signup OFF 확인**(코드로 강제 불가). 확인 전 운영 URL 공개 금지. Cloudflare Access를 쓰지 않기로 한 이상 이것이 사실상 유일한 1차 방어선이다.

### P0-3. 뮤테이션 재진입 가드 부재 — 더블클릭 시 중복 생성, 배정 유실

- **근거**: [`src/app/hooks/useMutationRunner.ts:16-33`](../src/app/hooks/useMutationRunner.ts) — 진행 중 여부를 검사하지 않는다. `saving` 상태는 [`Shell.tsx:219`](../src/screens/Shell.tsx)의 **새로고침 버튼에만** 전달되고, 어떤 제출 버튼도 `disabled={saving}`이 아니다. `review_requests`·`projects`·`review_feedback`·`profile_notes`에 unique 제약이 없다.
- **시나리오 A (중복 생성)**: 느린 네트워크에서 "검토요청 보내기" 두 번 클릭 → insert 2건.
- **시나리오 B (데이터 유실)**: [`master.ts:258-279`](../src/data/mutations/master.ts) `assignProduct`는 렌더 시점의 stale `data.productAssignments`로 `currentIds`를 만들어 **replace RPC**를 호출한다. 첫 배정의 refresh가 끝나기 전 두 번째 배정을 실행하면 **방금 만든 배정이 replace에 의해 삭제**된다.
- **조치**: `mutate`에 in-flight 가드 추가 + 모든 제출 버튼에 `disabled={saving}` 적용.

### P0-4. "사용자 제거" 문서 절차가 과거 업무 이력을 통째로 삭제하고, 파트장 계정엔 실패

- **근거**: [`OPERATIONS.md:65-74`](./OPERATIONS.md)·[`DEPLOYMENT.md:44`](./DEPLOYMENT.md)는 "Auth Users에서 삭제 → profiles cascade"만 안내. 실제 스키마: `review_requests.requester_id → profiles` **on delete cascade**([`202607020001:70`](../supabase/migrations/202607020001_initial_schema.sql)), `review_feedback → review_requests` cascade(`:81`), `activity_logs.actor_id` cascade. 반면 `review_feedback.leader_id`(`:82`)와 `projects.created_by`(`:93`)는 **on delete restrict**.
- **결과**: ① 퇴사한 파트원을 문서대로 삭제하면 **그의 검토요청·피드백·활동로그 전체가 경고 없이 영구 삭제**된다(백업은 주 1회뿐). ② 피드백을 남겼거나 프로젝트를 만든 파트장 계정 삭제는 FK 오류로 실패하는데 문서에 대처가 없다.
- **조치**: "이력 보존이 필요하면 삭제 대신 **비활성화(is_active)**를 기본으로 한다"를 명시하고, 삭제 시 함께 사라지는 데이터 목록과 파트장 삭제 실패 케이스를 문서에 추가.

---

## P1 — 배포 전 또는 첫 주 내 조치

### 코드

| # | 항목 | 근거 | 결과 |
|---|------|------|------|
| P1-1 | 뮤테이션 성공 후 refresh 실패가 "작업 실패"로 표시 | `useMutationRunner.ts:21-27` — operation과 refresh가 한 try 블록 | insert 성공했는데 에러 토스트 → 사용자 재시도 → 중복 생성 |
| P1-2 | 수동 새로고침 실패가 완전 침묵 | `useAppData.ts:18-33` — `catch` 없음 | 스피너만 꺼지고 아무 표시 없음 → 최신 데이터로 오해 |
| P1-3 | `refreshData` 동시 실행 경합 | `useAppData.ts:18-33` — 세대 토큰·취소 없음 | 느린 이전 요청이 나중에 resolve되어 **방금 만든 항목이 화면에서 사라짐** |
| P1-4 | 첨부 고아 파일 3경로 | `attachments.ts:41-51` — `remove` 호출이 코드베이스에 없음 | insert 실패·수정·회수 시 Storage 파일 잔존. 무료 티어 1GB 누수, UI로 정리 불가 |
| P1-5 | 월별 통계 월 경계 오류 | `stats.ts:11-14` — `created_at.slice(0,7)`은 UTC | 7/1 08:30 KST 등록 건이 **6월 집계**로 잡힘 |
| P1-6 | 데모/원격 정반대: 업무 대분류 삭제 | `appDataReducers.ts:342-347` vs `202607050009:14` on delete restrict | 원격은 거부, 데모는 성공 후 orphan. 데모로 확인한 동작과 실서비스가 다름 |
| P1-7 | 기능 회귀: member가 파트장 이름을 못 봄 | [`202607060006`](../supabase/migrations/202607060006_public_leader_profiles.sql)은 "뷰가 owner로 실행"을 전제로 만들어졌으나 [`202607070001:5`](../supabase/migrations/202607070001_harden_audit_rls_and_revoke_anon_rpc.sql)가 `security_invoker=true`로 변경 | member의 `profiles` RLS(자기 행만)가 적용되어 뷰가 **0건** 반환. 보안 문제는 아니고 안전하게 degrade되나, MANUAL의 검증 항목이 깨짐 |

### 운영 문서

| # | 항목 | 결과 |
|---|------|------|
| P1-8 | MANUAL A~G에 **Supabase 프로젝트 생성**·**member 계정 생성** 단계가 없음 | B에서 "Settings → API 값을 읽어라"는데 프로젝트가 없다. D의 완료 기준은 "member 2명"인데 절차엔 파트장 bootstrap만 있다 |
| P1-9 | A→B 순서 트랩 | A 완료 기준이 "Deploy Worker green"인데, B(Secrets 등록) 전 첫 push는 `deploy-worker.yml:77-89`가 **의도적으로 exit 1**. 빨간 X를 코드 문제로 오인 |
| P1-10 | SQL Editor 경로에서 확인 쿼리 불가 | `schema_migrations` 조회는 **CLI `db push` 전용**. 방법 2로 적용하면 0건 → 정상인데 "미적용"으로 오판, 비멱등 재실행 위험 |
| P1-11 | **Storage 첨부는 어떤 백업에도 없음** | `backup-db.ps1`은 DB 덤프만. 프로젝트 유실 시 첨부 전량 복구 불가 |
| P1-12 | 복구 리허설에 구체 명령이 없고 FK 순서 미언급 | `profiles.id → auth.users(id)` FK. 빈 프로젝트에 data 덤프를 넣으면 profiles부터 실패 |
| P1-13 | Supabase CLI 설치 전제 미문서화 | `backup-db.ps1:20`은 전역 `supabase` 호출. 작업 G에서 "명령을 찾을 수 없음"으로 즉시 실패 |
| P1-14 | 7일 비활성 pause 재개 절차 없음 | 연휴 후 "앱이 안 열림" 장애 시 원인 항목이 장애 확인 순서에 없음 |
| P1-15 | RLS 자동 테스트 원격 안내가 실제로는 전부 skip | `tests/rls/helpers.ts`는 `localhost`에서만 실행. 원격 URL로 돌리면 green으로 보이지만 **아무것도 검증 안 함** |

---

## P2 — 개선 권장 (배포 차단 아님)

- **보안 하드닝**: `count_active_leaders_except`에 revoke 누락(anon이 활성 파트장 수 조회 가능) / `resolveAttachmentHref`가 비-storage 값을 무검증으로 `<a href>`에 삽입 — 기존 `normalizeHttpUrl`이 정의만 되고 **아무 데서도 쓰이지 않음** / CSP에 `object-src`·`base-uri`·`form-action` 미설정 / member의 `activity_logs` 자가 위조 삽입 가능(append-only, 사칭 불가)
- **코드**: 마감 퀵칩이 마운트 시 1회 계산되어 자정 넘기면 어제 날짜 입력 / `readState.setItem`에 try/catch 없어 저장소 차단 환경에서 리뷰 탭 진입 시 크래시 / 미확인 뱃지가 본인 행동도 집계 / CSV 파일 내부 중복 행 미검사(원격은 전체 실패, 데모는 중복 등록) + 스킵 건수 미표시 / 원격 피드백 임베드에 `order` 미지정 / 편집·회수 경합 시 원격은 0행 매치인데 성공 토스트
- **UX**: 반려 클릭 시 피드백 입력란으로 포커스 미이동 / 프로젝트 화면에 검색창 2개가 같은 상태를 공유하나 시각적으로 중복
- **문서**: DEPLOYMENT의 수동 배포 명령이 bash 전용 문법(파트장 PC는 Windows) / OPERATIONS 표 마크다운 깨짐 / MANUAL "차단 관계" 열이 양방향으로 읽힘

---

## 배포 후 즉시 확인 필요 (코드로 확인 불가)

1. **`_headers`가 실제로 적용되는가** — 배포는 `wrangler deploy --assets dist`이고 `wrangler.toml`이 없다. Workers Static Assets가 `dist/_headers`의 CSP·보안 헤더를 응답에 싣는지 운영 URL에 `curl -I`로 직접 확인. **미적용이면 CSP와 X-Frame-Options가 전부 무효.**
2. **public sign-up OFF** (P0-2)
3. **임시 비밀번호 길이** — 계정은 Dashboard Add user로 만드는데 Supabase Auth 기본 최소 길이는 6자로 알려져 있다. 4자리 `1234`는 **생성 단계에서 거부될 가능성**이 높다(P0-1 조치와 함께 해소됨).

---

## 확인 완료 — 이상 없음

**보안(견고함)**: 순수 비인증(anon) 데이터 유출 경로 없음(전 테이블 RLS enabled, 모든 정책 `to authenticated`) / member→leader RLS 권한 상승 경로 없음(`profiles`에 self-UPDATE 정책 없음, `allowed_users`는 leader 전용) / leader 전용 RPC 전부 함수 본문에서 `is_active_leader()` 검사 + anon revoke / member는 자기 pending 검토요청만 수정 가능하고 `with check`에 `status='pending'` 포함 → 상태 조작 불가 / 검토한 모든 UPDATE 정책이 USING과 `with check`를 함께 지정 / Storage 버킷 private + 서명 URL, **UPDATE 정책이 없어 타인 파일 덮어쓰기 불가**, 업로드 파일명 정규화로 path traversal 차단, DB 트리거가 소유자 경로 이중 검증 / 비활성 사용자 차단은 UI가 아니라 **RLS 레벨**(`can_use_app()`) / 마지막 활성 파트장 강등·비활성화 트리거 차단 / `dangerouslySetInnerHTML` 사용처 0건 / CSV 수식 인젝션 방어가 내보내기·가져오기 왕복 대칭 / 저장소에 service_role 키·anon key·project ref·계정 ID 커밋 없음

**코드**: 검토 상태 전이가 클라이언트 검증과 DB RPC에서 정확히 일치 / `recordActivityLog`가 실패해도 던지지 않음(본 작업과 분리됨) / D-day 계산은 `date` 컬럼 + 로컬 자정 기준이라 타임존 경계 정상 / `useAuthProfile`의 부트스트랩 타임아웃·세대 가드·effect 취소 모두 올바름 / `useHashNavigation`의 역할별 탭 가드가 모든 경로에서 동작 / 원자적 RPC(`replace_*_assignments`, `create_project_with_assignments`)가 서버에서 원자적 수행

**문서**: 마이그레이션 목록 28개 = 실제 파일 28개(이름·순서 일치) / Variables·Secrets 5개 이름이 워크플로 참조와 정확히 일치 / CI·Deploy Worker 단계 서술이 실제 워크플로와 일치 / README 환경변수 3종 = `.env.example` = `supabase.ts` 모드 처리 일치

**UX(실제 구동)**: 콘솔 오류 0건 / 반려 시 "사유를 먼저 입력해 주세요" 가드 동작 / 초안 저장→복원 라운드트립 동작 / 수정·회수 버튼이 본인 pending 요청에만 노출 / 초대 관리의 활성 배지·비활성화 토글 동작 / 모바일 375px 가로 오버플로 없음

---

## 총평

**RLS는 강하다.** 28개 마이그레이션에 걸친 권한 설계는 실제로 견고했고, anon 유출이나 권한 상승 경로는 찾지 못했다. 지금 이 시스템의 실질 위험은 세 곳에 몰려 있다.

1. **인증 게이트** — Cloudflare Access를 걷어낸 이상 "가입 차단 + 개별 임시 비밀번호"가 유일한 1차 방어선인데, 지금은 공통 `1234`가 로그인 화면에 적혀 있고 가입 차단은 미확인이다. (P0-1, P0-2)
2. **쓰기 경로의 재진입·경합** — 강한 RLS가 막아주지 않는 영역이다. 더블클릭 하나로 중복 생성과 배정 유실이 난다. (P0-3, P1-1~3)
3. **되돌릴 수 없는 운영 절차** — 사용자 삭제는 이력을 지우고, 첨부는 백업되지 않는다. 둘 다 사고가 난 뒤에는 복구 수단이 없다. (P0-4, P1-11)

P0 3건(P0-1·2·3)은 배포 전 반드시, P0-4와 P1 문서 항목은 파트장이 그 절차를 처음 실행하기 전까지 조치할 것을 권한다.
