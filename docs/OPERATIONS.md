# 운영 런북

SQA P1 Workflow의 일상 운영·백업·장애 대응 절차입니다.

운영 URL·Supabase project ref는 팀 위키 또는 이 문서 하단에 `<WORKER_URL>`, `<PROJECT_REF>` 형태로만 기록하고, 저장소에는 커밋하지 않습니다.

## 사전 준비 (Supabase CLI)

백업(`scripts/backup-db.ps1`)과 마이그레이션(`supabase db push`)은 **Supabase CLI**를 전제로 합니다. 설치가 안 되어 있으면 아래 절차의 명령이 모두 실패합니다.

Windows(파트장 PC) 기준 설치 방법 중 하나를 택합니다.

- **Scoop 권장**
  ```powershell
  scoop install supabase
  ```
- **매번 npx로 실행** (전역 설치 없이)
  ```powershell
  npx supabase --version
  ```

설치 후 1회 로그인합니다.

```powershell
supabase login
# npx 사용 시: npx supabase login
```

## 장애 확인 순서

| 순서 | 확인 대상 | 방법 | 정상 기준 |
|---|---|---|---|
| 1 | 앱 접속 | Workers URL 브라우저 접속 | 로그인 화면 또는 홈 표시 |
| 2 | Supabase 프로젝트 pause 여부 | Dashboard > 프로젝트 상태 | `Active` 표시 (일시정지 아님) |
| 3 | Cloudflare Workers | Dashboard > Workers & Pages > 해당 Worker | 최근 배포 성공, 에러율 없음 |
| 4 | Supabase | Dashboard > Logs (API, Auth) | 5xx 급증 없음 |
| 5 | Auth | Dashboard > Authentication > Users | 로그인 시도 실패 패턴 확인 |

> **앱이 아예 안 열리면 pause를 먼저 의심하세요.** Supabase 무료 티어는 **7일 동안 접속(활동)이 없으면 프로젝트를 자동으로 pause**합니다. pause 상태면 API·Auth가 모두 응답하지 않습니다. Dashboard에서 해당 프로젝트를 **Restore/Resume**하면 몇 분 뒤 복구됩니다. 연휴·장기 미사용 구간 전에는 **접속 1회 루틴**(누군가 로그인만 해도 됨)으로 pause를 예방하세요.

### 알림·자동 갱신이 안 될 때

Realtime·데스크톱 알림은 **실패해도 오류를 표시하지 않도록** 설계되어 있습니다(앱은 5분 안전망 폴링 + 창 복귀 재조회로 계속 동작). "알림이 안 온다"는 신고는 아래 순서로 확인합니다.

| 증상 | 확인 | 조치 |
|---|---|---|
| 새 검토요청이 즉시(수 초 내) 반영되지 않고 몇 분 뒤에만 보임 | SQL Editor: `select exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='review_requests');` | `false`면 migration `202607090001` 미적용 — Actions → **DB Migrate** 실행 ([SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md)) |
| 데스크톱 알림이 안 뜸 | ① 파트장 계정인가 ② 벨 패널에서 옵트인했는가 ③ 브라우저 사이트 권한이 `허용`인가 ④ 창이 **비포커스**였는가 (앱을 보고 있으면 뱃지만 갱신) | 브라우저 사이트 설정에서 알림 권한 허용 후 벨 패널에서 다시 켜기. 모바일 브라우저는 미지원(뱃지만 동작) |
| Realtime 연결 실패가 의심됨 | Supabase Dashboard → Logs → Realtime | 연결 실패여도 데이터는 폴링으로 갱신된다 — 즉시성만 떨어짐 |

## 주간 백업

### 자동 백업 (기본) — GitHub Actions

`.github/workflows/backup.yml`이 **매주 일요일 05:00 KST**(cron)에 스키마·데이터를 덤프해 **AES-256으로 암호화한 뒤** 워크플로 아티팩트(보존 90일)로 업로드합니다. Actions 탭에서 **Backup DB > Run workflow**로 수동 실행도 가능합니다.

| 항목 | 내용 |
|---|---|
| 필요 Secrets | `SUPABASE_DB_URL` (Dashboard > Connect의 Session pooler URI), `BACKUP_PASSPHRASE` (암호화 암구호) |
| 암호화 이유 | 이 저장소가 public인 동안 아티팩트는 누구나 다운로드 가능 — 팀원 이름·이메일이 담긴 덤프는 평문 업로드 금지 |
| 암구호 보관 | **분실 시 백업 복원 불가.** 비밀번호 관리자 등 통제된 곳에 보관 |
| 확인 | 주 1회 Actions run이 green인지, Job Summary에 `Backup OK`가 있는지 |

복원 시 복호화:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in db-backup-<date>.tar.gz.enc -out db-backup.tar.gz
tar xzf db-backup.tar.gz
```

### 수동 백업 (보조)

Actions를 쓸 수 없거나 마이그레이션 직전 즉석 백업이 필요할 때:

| 항목 | 내용 |
|---|---|
| 명령 | `$env:DATABASE_URL = "<DATABASE_URL>"; powershell -File scripts/backup-db.ps1` (스키마·데이터 각각 덤프) |
| 보관 | 사내 접근 통제된 저장소(로컬 NAS, 암호화 드라이브). **공개 저장소·이메일 첨부 금지** |
| 확인 | `*-schema.sql`·`*-data.sql` 모두 크기 > 0, schema 파일에 `CREATE TABLE`, data 파일에 `COPY` 또는 `INSERT` 포함 |

`DATABASE_URL`은 Supabase Dashboard > Project Settings > Database > Connection string (URI)에서 확인합니다. **명령행 인자로 URL을 넘기지 마세요** — shell history에 비밀번호가 남을 수 있습니다.

### Storage(첨부파일) 백업

> **`scripts/backup-db.ps1`은 DB(스키마·데이터)만 덤프합니다. `review-attachments` 버킷의 Storage 첨부파일은 어떤 백업에도 포함되지 않습니다.** DB만 복원하면 검토요청의 `attachment_url`은 남지만 실제 파일은 없어 다운로드가 깨집니다.

**확정 규정(2026-07-09, 파트장): B안 — 첨부파일은 백업 대상이 아니다.** `review-attachments` 버킷은 어떤 백업에도 포함하지 않는다. 앱 첨부는 **공유·리뷰 편의용**으로만 쓰고, **중요 문서의 원본은 작성자 각자가 보관**한다. 따라서 DB만 복원하면 과거 검토요청의 `attachment_url`은 남지만 실제 파일은 없을 수 있으며, 이는 수용된 동작이다.

> **팀 공지 필요(사용 규정):** "앱에 올린 첨부는 백업되지 않으니, 원본은 반드시 본인 PC/드라이브에 따로 보관하세요." — 개인정보·데이터 보관 공지(아래 "개인정보 처리" 절)와 함께 1회 공지하고 공지 일자를 기록한다.

참고 — 검토했으나 채택하지 않은 대안:

| 방식 | 내용 | 적합한 경우 | 채택 |
|---|---|---|---|
| A. 수동 백업 | Supabase Dashboard → Storage → `review-attachments`에서 파일을 주기적으로 수동 다운로드해 DB 백업과 같은 통제 저장소에 보관 | 첨부가 업무상 재확보 불가한 원본일 때 | ✕ |
| B. 백업 제외 | "첨부는 백업 대상이 아님 — 중요 문서는 각자 원본을 보관"을 운영 규정으로 공지하고, 앱 첨부는 공유·리뷰 편의용으로만 사용 | 첨부가 사본이고 원본을 작성자가 항상 보유할 때 | **✓ 채택** |

## Auth 계정 생성·정리

앱에는 **로그인 화면만** 있습니다. 공개 sign-up UI는 제공하지 않습니다.

| 설정 | 권장 | 확인 위치 |
|---|---|---|
| Enable email signup | **OFF** | Authentication → Providers → Email |
| 계정 생성 | Dashboard **Add user**만 | Authentication → Users |

> 운영 프로젝트에는 `disable_signup: true`가 적용되어 있다 (2026-07-09, Management API로 적용·확인). 설정을 되돌리지 않는 한 재확인은 불필요하다.

> **수용한 Auth 설정 — "Require current password when updating"는 OFF로 둔다** (2026-07-09 확정). 이 앱은 `@supabase/supabase-js ^2.53.0`을 사용하는데, 이 버전은 비밀번호 변경 시 현재 비밀번호를 함께 보내는 `current_password` 파라미터를 지원하지 않는다. 이 토글을 ON으로 되돌리면 최초 로그인 비밀번호 변경(`src/screens/PasswordChangePanel.tsx`)이 `Current password required when setting new password` 400 오류로 **막힌다**. `current_password`를 지원하는 버전(supabase-js ≥ 2.102.0)으로 올려 변경 화면에 현재 비밀번호 입력을 추가하기 전에는 이 토글을 켜지 않는다.

계정 생성 절차와 임시 비밀번호 규칙은 아래 "임시 비밀번호·첫 로그인" 절을 따릅니다.

### 미승인 Auth 계정 정리

초대 없이 Dashboard에서만 생성된 계정, 또는 테스트 중 남은 계정이 쌓일 수 있습니다.

1. Supabase Dashboard > Authentication > Users
2. `profiles`에 대응 row가 없거나 `allowed_users`에 없는 이메일 조회
3. 미사용 계정이면 Users에서 삭제
4. public sign-up이 OFF이므로 미승인 계정은 Dashboard 생성 경로에서만 생깁니다 — 계정 생성은 파트장만 수행합니다

## 분기 복구 리허설

1. 테스트용 Supabase 프로젝트(또는 로컬 Postgres)를 준비합니다.
2. 최신 백업 SQL을 `psql` 또는 Supabase SQL Editor로 복원합니다.

   > **복원 순서 — 현재 백업은 그대로 schema → data 순으로 적용하면 됩니다** (2026-07-09 리허설로 확인). `backup.yml`의 `supabase db dump`는 `auth.users`·`auth.identities`·`storage.buckets`를 데이터 덤프에 포함하고, 덤프 선두에 `SET session_replication_role = replica;`가 있어 FK 검사가 꺼진 상태로 적재됩니다. 따라서 `profiles.id → auth.users(id)` FK 순서를 사람이 맞출 필요가 없습니다.
   >
   > 예시(schema 먼저, data 나중):
   > ```powershell
   > $env:PGPASSWORD = '<DB_PASSWORD>'
   > psql "<DATABASE_URL>" -f backup/sqa-p1-workflow-<date>-schema.sql
   > psql "<DATABASE_URL>" -f backup/sqa-p1-workflow-<date>-data.sql
   > ```
   > **폴백(덤프에 `auth` 스키마가 없을 때만):** 과거·수동 덤프처럼 `auth.users`가 빠진 백업이라면 `profiles` 복원이 FK 위반으로 실패합니다. 이때만 Dashboard > Authentication > Users에서 동일 이메일 계정을 먼저 만든 뒤 `public.profiles` → 나머지 순으로 복원합니다.

3. `profiles`, `review_requests`, `products` 행 수를 운영과 대조합니다.
4. RLS smoke test를 실행합니다 (`tests/rls/setup.sql` 참고).
   - Supabase local: `supabase start` 후 `SUPABASE_URL=http://127.0.0.1:54321` 등 env 설정, `npm test -- tests/rls`
   - 원격 테스트 DB: 동일 env + `RLS_*` 테스트 계정 변수 설정
   - local/자동화 불가 시 [TEST_PLAN.md](./TEST_PLAN.md)의 RLS 수동 검증 시나리오로 대체
5. 리허설 날짜·담당·결과를 이 문서 하단 또는 팀 위키에 기록합니다.

## 사용자 제거 (퇴사·전배자 처리)

**기본 원칙: 삭제하지 않고 비활성화한다.** 퇴사·전배자는 즉시 삭제하지 말고 **비활성화(`is_active=false`)를 기본**으로 처리합니다. 비활성화만으로 로그인·데이터 접근이 즉시 차단됩니다. 삭제는 **일정 보존 기간(권장: 1년) 경과 후**에만 검토합니다.

초대 목록(`allowed_users`)에서 삭제하는 것만으로는 **이미 가입한 계정의 로그인을 막을 수 없습니다.** 접근 회수는 아래 비활성화로 합니다.

### 1단계(기본): 비활성화

| 단계 | 작업 | 확인 |
|---|---|---|
| 1 | 마스터 > 초대 관리에서 대상 사용자 `비활성화` (`is_active` 토글) | 상태 배지가 `비활성`으로 변경 |
| 2 | 대상 계정으로 로그인 시도 | "계정이 비활성화되었습니다" 안내, 데이터 접근 불가 |
| 3 | (선택) `allowed_users`에서도 제거 | 앱 > 마스터 > 초대 관리 |
| 4 | (복귀 시) 재활성화 후 로그인 | 정상 홈 진입 |

상세 RLS·Storage 검증은 [MANUAL_TASKS_PLAN.md](./MANUAL_TASKS_PLAN.md) 작업 F를 참고합니다.

> 마지막 active leader는 비활성화·강등이 DB에서 거부됩니다(202607070005). leader를 내보낼 때는 먼저 **다른 사람을 leader로 지정(이관)한 뒤** 대상 leader를 비활성화하세요.

### 2단계(보존 1년 경과 후에만): 삭제

> ⚠️ **삭제는 되돌릴 수 없고, 그 사람이 남긴 이력이 함께 영구 삭제됩니다.** Auth Users에서 계정을 삭제하면 `profiles`가 cascade로 삭제되며, 이에 딸린 다음 데이터가 **함께 영구 삭제**됩니다.
> - 그 사람이 올린 **검토요청**(`review_requests.requester_id` → CASCADE) 및 그에 달린 **피드백**(`review_feedback` → CASCADE)
> - 그 사람의 **활동로그**(`activity_logs.actor_id` → CASCADE)
> - `product_assignments`·`duty_assignments`·`project_assignments`·`profile_notes` 등 배정·메모 (모두 CASCADE)
>
> ⚠️ **leader 계정은 삭제 자체가 실패할 수 있습니다.** 그 사람이 **피드백을 남겼거나**(`review_feedback.leader_id` → `ON DELETE RESTRICT`) **프로젝트를 만든**(`projects.created_by` → `ON DELETE RESTRICT`) 경우, 참조가 남아 있는 한 삭제가 **FK 오류로 실패**합니다. leader는 원칙적으로 비활성화만 하고, 부득이 삭제해야 하면 참조 이력을 먼저 정리/이관해야 합니다.
>
> (FK 근거: `supabase/migrations/202607020001_initial_schema.sql`, `202607040003_operational_queue.sql`)

보존 기간(권장 1년)이 지나 삭제가 확정되면:

| 단계 | 작업 | 확인 |
|---|---|---|
| 0 | **DB·Storage 백업 수행** | `scripts/backup-db.ps1` + Storage 수동 백업(위 백업 절 참고) |
| 1 | 대상이 leader이면 leader 권한·프로젝트·피드백을 다른 사람에게 이관 | 참조 이력 정리 |
| 2 | Supabase Dashboard > Authentication > Users에서 대상 삭제 | `profiles` 및 위 CASCADE 데이터가 함께 삭제됨 |
| 3 | `allowed_users`에서도 제거 | 앱 > 마스터 > 초대 관리 |
| 4 | 대상 계정으로 로그인 시도 | 접근 불가 확인 |

## 임시 비밀번호·첫 로그인

**공통 임시 비밀번호는 `1234`를 유지**하되, **최초 로그인 시 비밀번호 변경을 강제**합니다(파트장 확정).

1. 파트장이 `allowed_users`에 이메일·이름·역할을 등록합니다.
2. Supabase Dashboard > Authentication > Users > **Add user** 로 계정을 만듭니다 (앱 가입 UI 없음). 임시 비밀번호는 `1234`.
   - Dashboard가 최소 비밀번호 길이 제한으로 `1234` 생성을 거부하면 Authentication → Providers → Email의 **Minimum password length**를 일시적으로 4로 낮춥니다. **계정 생성이 끝나면 반드시 6(권장 8) 이상으로 되돌립니다** — 낮춘 채로 두면 이후 모든 비밀번호에 대해 프로젝트 정책이 약해집니다(앱 변경 화면의 8자 강제는 클라이언트 측 검증일 뿐입니다).
3. 사용자는 `1234`로 로그인한 뒤 `must_change_password` 화면에서 **8자 이상**의 새 비밀번호로 변경합니다. `'1234'` 등 너무 단순한 비밀번호는 새 비밀번호로 거부됩니다.

### 최초 변경은 이제 서버(RLS)에서 강제됨

`must_change_password=true`인 동안에는 **RLS 레벨에서 데이터 읽기/쓰기가 차단**됩니다(마이그레이션 `202607080001`). 세션을 얻어 화면을 우회하고 REST/RPC를 직접 호출해도, 비밀번호를 바꾸기 전에는 어떤 데이터에도 접근할 수 없습니다. (자기 자신 `profiles` row 조회와 비밀번호 변경 RPC만 예외 — 변경 화면을 그리기 위함)

### 잔여 위험과 완화책

- **잔여 위험(계정 선점):** 임시 비밀번호가 공통 `1234`이므로, 공격자가 **대상 본인보다 먼저 `1234`로 로그인해 비밀번호를 바꿔버리면 계정을 탈취**할 수 있습니다. RLS 강제는 "바꾸기 전엔 접근 불가"를 보장할 뿐, "누가 먼저 바꾸느냐"는 막지 못합니다.
- **완화책:**
  1. **온보딩은 한 명씩** — 계정 생성 **직후 즉시 본인이 로그인해 비밀번호를 변경**하게 합니다. 미사용 상태로 `1234`인 계정을 오래 방치하지 않습니다.
  2. **public sign-up OFF는 필수 전제** — Supabase Dashboard에서 Enable email signup을 반드시 OFF로 둡니다(위 Auth 절 참고).

## 알려진 한계 (수용한 위험)

- **활동 로그 자기 명의 삽입**: member가 `activity_logs`에 자기 명의(`actor_id=self`)의 임의 로그를 삽입할 수 있다. 타인 사칭·수정·삭제는 불가(append-only)해 위험이 낮고, 차단하려면 모든 뮤테이션의 로그 삽입을 SECURITY DEFINER RPC로 옮기는 큰 변경이 필요해 수용한다. 감사 요구가 생기면 그때 RPC 경유로 좁힌다.
- **공통 임시 비밀번호 `1234` 선점**: 위 "임시 비밀번호·첫 로그인" 절의 잔여 위험 참고 — "한 명씩 즉시 온보딩 + public sign-up OFF"로 완화한다.

## 개인정보 처리 (팀 공지 필요)

이 앱은 팀원의 **이름·이메일**을 Supabase(외부 클라우드)에 저장합니다. Supabase 프로젝트는 **서울 리전(`ap-northeast-2`)** 에 생성합니다.

> **사용 시작 전 팀 공지 1회가 필요합니다.** 팀원 이름·이메일이 외부 클라우드(Supabase, 서울 리전)에 저장된다는 사실을 사용 시작 전에 팀에 1회 공지하고, 공지 일자를 이 문서 하단 또는 팀 위키에 기록합니다.

> **저장소 public 전환 금지.** 현재 HEAD는 실값을 제거했지만, **git 이력에는 과거 커밋의 팀원 실명·사내 이메일·운영 프로필 UUID·운영 URL이 남아 있습니다.** 이력 재작성(`git filter-repo` 등)과 노출 값 전수 점검 없이는 이 저장소를 절대 public으로 전환하지 않습니다. fork·이관·외부 공유도 동일하게 취급합니다.

## 배포

자세한 CI/CD 설정은 [DEPLOYMENT.md](./DEPLOYMENT.md)를 참고하세요.  
**직접 수행 작업 전체 계획**은 [MANUAL_TASKS_PLAN.md](./MANUAL_TASKS_PLAN.md)를 참고하세요.

새 마이그레이션 적용은 로컬 CLI(`npx supabase db push`) 또는 **Actions → DB Migrate**(workflow_dispatch, `SUPABASE_DB_URL` Secret 사용 — 로컬 Supabase 인증 불필요)로 수행합니다. 절차와 확인 SQL은 [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md) 참고.

Windows에서 `npm ci`가 `EPERM`으로 실패하면, 다른 터미널·에디터에서 `node_modules`를 잠그고 있지 않은지 확인한 뒤 해당 폴더를 삭제하고 다시 실행하세요.

## 데이터 시드 재생성 (선택)

제품·업무 배정을 사설 CSV에서 일괄 생성해야 할 때 사용합니다. 일상 등록은 앱의 마스터 탭(CSV 가져오기 포함)으로 충분합니다.

1. `data/private/*.example` 3개 파일을 `.local.*`로 복사해 실제 값 입력 (`.local.*`은 커밋되지 않음)
2. `node scripts/generate-p1-product-seed.mjs` / `node scripts/generate-p1-duty-seed.mjs` 실행
3. 생성된 `scripts/.seed-batches/*.sql`(비추적)을 SQL Editor에서 실행

## 제품명 중복 정리 (products_name_key)

`202607060002` migration은 **중복 제품을 삭제하지 않습니다**. 중복이 있으면 migration이 실패하므로, 적용 전 반드시 수동 병합하세요. `202607060003_audit_product_duplicates.sql`은 중복을 감사 테이블(`product_dedup_audit`)에 기록하고 unique constraint를 적용합니다.

| 단계 | 작업 | 확인 |
|---|---|---|
| 0 | DB 백업 수행 | `scripts/backup-db.ps1` |
| 1 | `select name, count(*) from public.products group by name having count(*) > 1;` | 중복 제품명·건수 확인 |
| 2 | 중복이 있으면 **업무 기준으로 수동 병합** (배정·활동 로그·검토 참조 확인) | `product_assignments`가 올바른 `product_id`를 가리키는지 |
| 3 | 병합 후 중복 행 삭제 | `group by name having count(*) > 1` 결과 0건 |
| 4 | `202607060002` migration 적용 | `products_name_key` 존재, RPC 생성 |
| 5 | `202607060003` migration 적용 (선택 감사) | `product_dedup_audit`에 기록 확인 |

## 복구 리허설 기록

| 날짜 | 담당 | 백업 파일 | 결과 |
|---|---|---|---|
| 2026-07-09 | 파트장 + Claude | db-backup-2026-07-09 (Backup DB run 29015812702) | 성공 — 복호화 후 테스트 프로젝트에 schema→data 복원, 에러 0건. 행 수 대조: 사용자 10 / 제품 218 / 배정 198 / 직무 25. 리허설 중 최초 `BACKUP_PASSPHRASE` 분실 발견 → 교체·재백업으로 해결(암구호는 비밀번호 관리자 보관 필수) |
