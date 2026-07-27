# 테스트 계획

## 현행 자동 게이트

아래 순서를 로컬과 CI의 기준으로 사용한다. 이 절은 아래의 과거 수동 시나리오와 충돌할 경우 우선한다.

```text
npm ci
npm run typecheck
npm run lint
npm test -- --run
npm run build
npm run check:bundle
npm run test:e2e
git diff --check
```

DB/repository/운영 변경은 Docker와 pinned Supabase CLI `2.109.1`이 준비된 환경에서 `npm run test:rls:full`까지 성공해야 한다. 일반 unit run에 환경형 RLS test가 skip으로 보이는 것은 개발 피드백일 뿐 완료 증거가 아니다. full runner의 skip 또는 실패는 전체 완료를 차단한다.

Playwright **preview** project(`npm run test:e2e`)는 local adapter 회귀용 17개 시나리오로 다음 계약을 독립적으로 차단한다: leader/member navigation, command palette, review lifecycle, project CRUD, product transfer, change task lifecycle, deep-link, density persistence, mobile sidebar, notification/read navigation, review stats filter, modal focus return.

Playwright **remote** project(`npm run test:e2e:remote`)는 local Supabase + production build 정적 자산으로 UI→Auth→RPC→RLS 종단 13개 시나리오(R-E2E-01~13)를 차단한다. setup만 service role을 사용하고 브라우저에는 anon key와 시험 사용자 credential만 전달한다. production secret 사용을 금지한다. Docker/local Supabase가 없으면 이 게이트는 실행하지 않으며, `REMOTE_E2E_REQUIRED=1`일 때 미구성은 fail-closed다.

권장 CI 순서:

```text
typecheck / lint / unit
        ↓
local-supabase-integration (RLS + remote browser E2E)
        ↓
build/release gate
```

Workflow contract test는 RLS job 삭제, E2E job 삭제, build dependency 누락, secret 과다 주입, readiness manifest 누락/중복, 미등록 `60_*.sql`을 거부한다.

## 감사 로그 lifecycle

- migration contract test는 실제 trigger의 모든 entity type과 v3 helper allowlist가
  정확히 일치하는지 비교한다.
- RLS fixture는 공지 INSERT/UPDATE/DELETE를 수행하고 생성 snapshot, 변경 필드 delta,
  삭제 직전 snapshot을 leader list RPC로 확인한다.
- constraint로 거절된 mutation이 같은 entity의 audit event 수를 늘리지 않는지 확인한다.
- member/anon list RPC와 authenticated private schema 직접 조회를 거부한다.
- UI test는 lifecycle snapshot, update 전후 값, legacy ID-only 안내, credential 필드
  방어 필터, XSS 문자열의 text 렌더링, snapshot 검색을 검증한다.

로컬 Docker가 없으면 RLS suite skip은 개발자 피드백용으로만 허용된다. DB PR 완료
증적에는 CI의 `RLS_REQUIRED=1` Stage B fixture 결과가 반드시 필요하다.

## 앱 기능

- 파트장 화면에서 초대 사용자, 제품, 업무, 담당제품, 담당업무, 프로젝트, 프로젝트 배정을 생성한다.
- 파트원 화면에서 본인 담당제품/담당업무/프로젝트만 보이는지 확인한다.
- 파트원이 검토요청을 생성하면 상태가 `대기중`으로 표시된다.
- 파트원이 검토요청을 생성할 때 검토 기한은 `기한없음` 또는 날짜 중 하나만 선택할 수 있고, 날짜 선택 시 목록과 우선처리 큐에 기한이 보인다.
- 파트장/파트원 검토요청 목록에서 상태 필터(`전체`, `대기중`, `완료`, `반려`)가 목록을 정확히 좁히는지 확인한다.
- 파트장 대시보드의 `우선처리 큐`는 기한이 임박했거나 오래 대기 중인 검토요청을 프로젝트 마감/기초데이터 누락보다 먼저 보여준다.
- 파트장은 `pending` 상태의 검토요청에 피드백을 남길 수 있으며, 상태는 `pending`으로 유지된다. 최종 판단 시 `완료` 또는 `반려`로 전환한다.
- 파트장이 피드백을 여러 개 남기면 파트원 화면에 이력으로 보인다.
- 프로젝트 배정 화면에는 활성 `member`와 현재 로그인한 활성 파트장 본인이 보이며, 다른 파트장은 보이지 않는다.
- 담당자가 없는 제품은 담당 상태를 `미지정`으로 저장하고 비고에 미지정 사유(최대 1000자)를 입력·수정할 수 있다. 담당자를 배정하면 기존 사유가 자동 삭제된다.
- 파트장 검토요청 칸반은 상태별 최초 3건만 표시하고, `나머지 N개 보기`/`접기`로 확장·축소된다.
- 파트장이 프로젝트 카드에서 이름, 마감일, 상태, 설명을 수정하면 프로젝트 현황과 파트원 배정 업무에 반영된다.
- 대시보드 `최근 활동`에는 검토요청 생성, 상태 변경, 피드백, 프로젝트 생성/배정/수정이 시간순으로 보인다.
- 파트원 대시보드의 `내 알림/리마인더`에는 본인 검토요청 기한과 미완료 프로젝트 마감이 보인다.
- 기초데이터 삭제 아이콘은 첫 클릭에서 바로 삭제하지 않고, 같은 행의 `삭제 확인`을 눌렀을 때만 삭제한다.
- 파트원이 `pending` 상태의 본인 검토요청을 수정·회수할 수 있고, 회수 후 파트장 우선처리 큐와 목록에서 사라진다.
- `rejected` 상태의 본인 검토요청은 파트원이 내용을 수정할 수 있지만 회수할 수는 없다. `approved` 상태는 수정·회수할 수 없다.
- 파트원은 반려된 요청에 수정 내용을 피드백으로 남기고 `피드백 작성 후 재검토 요청`을 누를 수 있다. 새 요청이 생기지 않고 같은 ID가 `pending`으로 돌아오며 `재검토 요청`과 누적 `반려 이력 N회`가 표시된다.
- 같은 요청을 두 번 이상 반려·재요청해도 `review_round`, `rejection_count`, 파트장·파트원 피드백 이력이 한 요청에 순서대로 누적된다.
- 파트장이 검토요청을 `반려`할 때 피드백(사유) 없이는 상태 전환이 되지 않는다.
- 파트장 홈 우선처리 큐에서 검토요청을 클릭하면 검토요청 탭 해당 항목 상세가 바로 선택된다.
- URL 해시(`#/reviews?id=...`)로 새로고침해도 같은 탭·항목이 유지된다.
- 6개월 이전 종결 검토요청의 URL 해시도 단건 on-demand 조회 후 상세가 열리고, 접근권한 밖/삭제된 ID만 안내 후 해시가 정리된다.
- 파트장이 프로젝트 배정 인원을 추가/제외하고, 프로젝트를 삭제할 수 있다.
- 마스터 화면에서 제품/업무/초대 이름·코드·역할을 인라인 수정할 수 있다.
- 중복 제품명·업무명·초대 이메일·중복 제품 배정 시도 시 한국어 안내가 표시된다.
- 파트원 검토요청 목록은 최신 접수순, 파트장 목록은 진행 중 요청이 종결 요청보다 위에 온다.
- 검토요청 탭을 열면 마지막 확인 시각 이후 신규 요청·피드백 수가 사이드바 뱃지에 표시되고, 탭 진입 후 뱃지가 사라진다.
- pending + 최근 종결 검토요청의 단일 조회가 상태 전환 중 행을 누락하지 않고, 겹친 행의 최신 `updated_at` 및 feedback ID union을 유지한다.
- 파트장 대시보드 `월간 검토 처리`에 이번 달 접수·완료·반려·평균 처리일과 최근 6개월 표가 보인다.
- 파트장 `활동 로그` 탭 제목이 **최근 100건**이며, 더 오래된 기록은 Dashboard/백업에서 확인해야 함을 안내한다.
- 마스터 `제품`/`초대 관리` 탭에서 CSV 가져오기로 일괄 등록할 수 있고, 기존 등록분과 **파일 내 중복 행**을 모두 건너뛰며, 가져온 건수와 건너뛴 건수를 안내한다.
- 앱 로그인 화면에 **가입 UI가 없고** 로그인만 가능하다. 미초대 계정은 `BlockedProfile` 안내가 표시된다.
- 파트장은 `pending` 검토만 `완료`/`반려`로 전환할 수 있고, `approved`/`rejected`에서는 확인 후 `다시 열기`로 `pending`에 복귀할 수 있다. 파트원에게는 재오픈 UI가 없다.
- 검토요청 작성·수정·상세 화면에는 첨부 업로드·URL·열기 기능이 없고, 업무 자료는 별도 사내 메신저로 전달하라는 안내만 표시된다.
- 최종 Stage B 스키마에는 `review-attachments` bucket·정책과 `review_requests.attachment_url`이 없으며, cleanup migration은 객체가 남으면 적용 전에 실패해야 한다.
- 마스터 초대 카드에서 가입한 사용자를 `비활성화`/`활성화`할 수 있고, 비활성 계정은 로그인 후 안내 화면만 표시된다.
- `npm test`와 `npm run build`가 CI에서 통과한다.

## 알림·동기화 (알림 패키지)

> Realtime 항목은 마이그레이션 `202607090001` 적용 후에만 통과한다. 미적용 상태에서는 오류 없이 5분 폴링만으로 동작하는 것이 정상(조용한 열화)이므로, 적용 여부는 [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md)의 publication 확인 SQL로 판단한다.

- 검토요청 상세와 프로젝트 카드의 `링크 복사`가 클립보드에 해시 딥링크(`#/reviews?id=...` 등)를 넣고, 그 링크로 열면 해당 항목이 바로 선택된다.
- 창을 백그라운드에 두고 다른 계정으로 데이터를 바꾼 뒤 창에 복귀하면(마지막 갱신 30초 경과 시) 자동 재조회된다. 아무 조작 없이도 5분마다 갱신된다.
- (Realtime) member가 검토요청을 생성하거나 반려 요청을 재요청하면 파트장 화면에 새로고침 없이 수 초 내 나타난다.
- (데스크톱 알림) 파트장이 벨 패널에서 알림을 켜고 창을 비포커스로 둔 상태에서 새 대기 요청이 오면 OS 알림이 뜨고, 클릭 시 해당 검토요청 상세로 이동한다. 앱을 보고 있는 동안에는 OS 알림 대신 벨 뱃지만 갱신된다.
- 데스크톱 알림 생성이 불가능한 환경(Chromium 계열 Android 등)에서도 앱이 오류 화면으로 떨어지지 않는다 — 벨 뱃지·목록 갱신만 동작.

## RLS 수동 검증

> 자동화된 RLS 테스트가 `tests/rls/`에 있다. 새 local stack의 `supabase start`는 모든 migration을 즉시 적용하므로, CI와 Deploy Worker는 Stage B 파일을 runner 임시 경로에 보관한 상태로 직전 migration까지 시작하고 파일을 즉시 복원한다. 이어 disposable local bucket을 Storage API로 제거한 뒤 `supabase migration up --local --include-all`로 Stage B와 그 이후 migration을 순서대로 적용한다. 이후 `supabase status -o env`의 local URL/key를 설정하고 `node scripts/setup-rls-fixtures.mjs`로 fixture를 만든 다음 `npm run test:rls`를 실행한다. 전용 명령은 환경이 없으면 skip하지 않고 실패한다. 아래 수동 시나리오는 자동 테스트가 못 덮는 항목의 보완이다.

Supabase에 최소 3명(`leader`, `member A`, `member B`)을 등록한 뒤 각 계정으로 로그인한다.

- `member A`는 `member B`의 `profiles`, `product_assignments`, `duty_assignments`, `review_requests`, `project_assignments`를 볼 수 없어야 한다.
- `leader`는 전체 `profiles`, 배정, 검토요청, 프로젝트를 조회하고 수정할 수 있어야 한다.
- `member A`가 `requester_id`를 `member B`로 넣어 검토요청을 생성하려 하면 RLS가 거부해야 한다.
- `member A`가 검토요청을 만들 때 `due_date`는 날짜 또는 `null`로 저장되고, 다른 사용자의 요청에는 여전히 접근할 수 없어야 한다.
- `member`가 `products`, `duties`, `projects`, `project_assignments`를 생성/수정/삭제하려 하면 RLS가 거부해야 한다.
- `leader`는 프로젝트 상태/마감일/설명을 수정할 수 있고, `member`는 프로젝트를 수정할 수 없어야 한다.
- `leader`는 `project_assignments.user_id`에 현재 로그인한 본인 계정을 넣을 수 있어야 하고, 다른 leader 계정을 넣으면 DB trigger/RLS가 거부해야 한다.
- `member`·anon은 제품 미지정 사유 RPC를 호출할 수 없어야 하며, 활성 leader가 사유를 저장한 뒤 제품을 배정하면 DB trigger가 사유를 `null`로 정리해야 한다.
- `leader`가 `projects.created_by`에 member 계정을 넣어 프로젝트를 만들려 하면 DB trigger/RLS가 거부해야 한다.
- `profile_notes.profile_id`는 member, `profile_notes.leader_id`는 leader만 허용되는지 확인한다. `review_feedback.leader_id`는 호환성을 위해 유지된 작성자 ID이며 `author_role`과 실제 프로필 역할이 일치해야 한다.
- `activity_logs`는 leader가 전체를 조회하고, member는 본인이 actor이거나 target인 로그만 조회할 수 있어야 한다.
- `member`가 `activity_logs.target_user_id`를 임의로 지정해 insert하려 하면 RLS가 거부해야 한다.
- `member`와 `leader`의 `review_requests`·`review_feedback` 직접 INSERT/UPDATE/DELETE는 모두 거부되고, 생성·수정·상태 전이·회수·피드백 변경은 허용된 OCC RPC로만 성공해야 한다.
- 본인 아닌 member의 `resubmit_review_request` 호출은 거부되고, 본인 rejected 요청은 같은 ID로 재요청되어야 한다. 동시 재요청은 하나만 성공해야 한다.
- 활성 파트장은 종결 검토요청을 재오픈할 수 있고, member·비활성 파트장·미인증 호출은 `reopen_review_request` RPC에서 거부되어야 한다.
- 같은 종결 요청에 대한 동시 재오픈 호출은 하나만 성공하고, 최종 상태는 `pending`이며 status audit 이벤트는 한 건이어야 한다.
- `withdraw_review_request`는 요청자 자신의 최신 `pending` 행만 필수 사유와 OCC 조건으로 철회하고, 행과 이벤트 이력을 유지해야 한다.
- 읽음 처리는 `review_read_receipts`와 DB 시각을 사용하며, 사용자는 자신의 영수증과 권한이 있는 요청의 이벤트만 조회할 수 있어야 한다.
- `mark_password_changed()`의 모든 overload와 구형 review RPC signature는 제거 상태여야 하며, 실제 Auth 비밀번호 hash 변경만 `must_change_password=false`를 만들고 `profiles` 물리 삭제는 service role에도 차단되어야 한다.
- anon은 `public` schema USAGE가 없고, authenticated/service role은 필요한 schema USAGE만 가지며 CREATE는 없어야 한다. 새 routine의 전역 default ACL에는 PUBLIC EXECUTE가 없어야 한다.
- `member` 계정을 `profiles.is_active = false`로 설정하면 본인 데이터 조회·쓰기가 RLS에서 거부되어야 한다.
- `leader` 계정을 `profiles.is_active = false`로 설정해도 API로 제품·프로젝트·검토요청을 조회·수정할 수 없어야 한다.
- `leader`는 `profiles.is_active`를 변경할 수 있어야 한다.
- `member` 계정으로 로그인해 검토요청·대시보드에서 파트장 **이름**이 표시되는지 확인한다. `public_leader_profiles` select가 실패하지 않고 **행이 0건이 아니어야** 한다(owner 권한 조회 — 202607080001).
- `member`는 파트장의 email 등 민감 정보를 볼 수 없어야 한다.

### 비밀번호 변경 강제 검증 (202607080001)

`must_change_password`는 RLS 헬퍼(`can_use_app`/`is_active_leader`)에서 서버 강제되므로 아래를 반드시 수행한다.

- `profiles.must_change_password = true`인 계정(계정별 무작위 임시 비밀번호로 방금 만든 계정)으로 로그인하면 앱이 비밀번호 변경 화면을 표시한다.
- 그 상태에서 세션 토큰으로 REST/RPC를 직접 호출해도(비밀번호 변경 화면 우회 시도) `products`·`review_requests`·`projects` 등 어떤 테이블도 조회·쓰기가 되지 않아야 한다(빈 결과/거부).
- 비밀번호 변경(8자 이상)을 완료해 `must_change_password = false`가 되면 이후 정상적으로 데이터가 조회·쓰기된다.
- 첫 파트장 계정도 동일하게, 비밀번호 변경 전에는 마스터/배정 등 leader 작업이 거부되고 변경 후 정상 동작해야 한다.
- 위 검증 후, 본문의 `is_active=false` 항목과 member/leader 격리 항목도 함께 확인해 헬퍼가 기존 격리를 깨지 않는지 확인한다.

## DR package 계약

- `src/drPackage.test.ts`는 정상 L2, Auth 없는 L3, checksum 변조, private audit 누락,
  migration history 누락, duplicate/absolute/traversal path, 빈 dump, CLI entrypoint를 검증한다.
- `src/workflows.test.ts`는 plaintext artifact 업로드 금지, Backup DB/DB Migrate/Deploy Worker 공통
  production concurrency, 동일 SHA DB Migrate run 증명, privileged step 단위 secret scope,
  현행 L2/Auth 미포함 선언을 검증한다.
- 이 code gate는 production credential 없이 실행한다. 실제 Auth UUID/hash/FK/login/RLS 복원
  성공은 폐기 가능한 신규 Supabase project의 Full DR rehearsal 전에는 완료로 표시하지 않는다.
- `src/drEvidenceCapture.test.ts`는 raw row가 digest/count evidence로만 축약되는지, 정렬·중복·
  Storage/FK 오류와 DB URL/project-ref mismatch가 차단되는지 검증한다.
- `src/restoredProject.test.ts`는 Auth UUID, 핵심 table checksum/count, migration/config, FK,
  보존 로그인, Auth settings, RLS/audit/review/change-task evidence를 exact match로 검증한다.
- `src/rlsTargetGuard.test.ts`와 `src/drRemoteSmoke.test.ts`는 remote RLS가 explicit disposable 확인,
  production ref 차이, exact Supabase hostname, allowlist를 모두 만족할 때만 실행됨을 검증한다.
- `.github/workflows/dr-rehearsal.yml`은 manual/environment 승인 전용이며 실제 운영 DoD에서는
  skip 0인 remote RLS 결과와 redacted evidence artifact를 확인한다.

## 로컬 검증 명령

```bash
npm ci
npm test
npm run build
npm run dev
```

Stage B에서는 추가로 `src/migrations.stageB.test.ts`와 `tests/rls/rls.storage.test.ts`가 최초/경합 zero-object guard, 최종 Storage 부재, legacy overload 제거, schema/routine/default ACL을 검증한다. 로컬 Supabase를 사용할 수 없으면 PR CI의 필수 RLS job 결과를 배포 증거에 연결한다.
