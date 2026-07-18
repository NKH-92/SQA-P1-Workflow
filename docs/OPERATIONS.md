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

## 매일 백업

### 자동 백업 (기본) — GitHub Actions

`.github/workflows/backup.yml`이 **매일 05:00 KST**(cron)에 스키마·데이터를 덤프해 AES-256 GPG 대칭 암호화(`.gpg`)와 전환 기간용 OpenSSL 형식(`.enc`)으로 만든 뒤, 두 파일을 실제 복호화·tar 검사하고 워크플로 아티팩트(보존 90일)로 업로드합니다. Actions 탭에서 **Backup DB > Run workflow**로 수동 실행도 가능합니다. DB Migrate는 동일 `main` SHA에서 24시간 이내 **schedule 또는 수동 실행**으로 성공한 백업이 없으면 DB 접속 전에 중단됩니다.

Backup job이 실패하면 `[Backup] Daily DB backup failed` issue를 새로 만들거나 기존 open issue에 실패 run 링크를 추가합니다. schedule 자체가 장기간 비활성화되는 경우에는 이 알림도 실행되지 않으므로, 외부 uptime/heartbeat 모니터는 별도로 유지해야 합니다.

| 항목 | 내용 |
|---|---|
| 필요 Secrets | `SUPABASE_DB_URL` (Dashboard > Connect의 Session pooler URI), `BACKUP_PASSPHRASE` (암호화 암구호) |
| 암호화 이유 | 이 저장소가 public인 동안 아티팩트는 누구나 다운로드 가능 — 팀원 이름·이메일이 담긴 덤프는 평문 업로드 금지 |
| 암구호 보관 | **분실 시 백업 복원 불가.** 비밀번호 관리자 등 통제된 곳에 보관 |
| 확인 | 매일 Actions run이 green인지, Job Summary에 `Backup OK`가 있는지 |

복원 시 복호화 — 신규 `.gpg` 기본 경로:

```bash
gpg --batch --pinentry-mode loopback --output db-backup.tar.gz \
  --decrypt db-backup-<date>.tar.gz.gpg
tar tzf db-backup.tar.gz
```

기존·전환 기간 `.enc` 호환 경로:

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

### 리뷰 첨부 Storage 폐기

앱은 리뷰 첨부를 업로드·조회하지 않는다. 기존 `review-attachments` 버킷은 운영자 purge와 0건 재확인 뒤 Stage B 마이그레이션에서 제거한다. 최종 스키마에는 버킷·정책·`attachment_url`이 모두 없어야 한다.

> **`scripts/backup-db.ps1`은 DB(스키마·데이터)만 덤프하며 Storage 객체를 포함하지 않습니다.** 2026-07-09의 기존 결정은 첨부를 백업 대상에서 제외하는 것이었지만, 실제 purge 전에는 운영자가 이 결정을 재확인하고 승인자를 기록해야 합니다.

삭제 자동화는 [REMOVE_REVIEW_ATTACHMENTS.md](./REMOVE_REVIEW_ATTACHMENTS.md)의 장벽을 따른다. 먼저 파일명을 노출하지 않는 dry-run의 객체 수·digest를 기록하고, 승인된 운영자만 명시적 confirm으로 purge한다. `verifiedRemainingObjectCount=0`과 재 dry-run `objectCount=0`이 모두 확인되기 전에는 Stage B를 적용하지 않는다. SQL로 `storage.objects`를 삭제하지 않는다.

## Auth 계정 생성·정리

앱에는 **로그인 화면만** 있습니다. 공개 sign-up UI는 제공하지 않습니다.

| 설정 | 권장 | 확인 위치 |
|---|---|---|
| Enable email signup | **OFF** | Authentication → Providers → Email |
| 계정 생성 | Dashboard **Add user**만 | Authentication → Users |

> 운영 프로젝트에는 `disable_signup: true`가 적용되어 있다 (2026-07-09, Management API로 적용·확인). 설정을 되돌리지 않는 한 재확인은 불필요하다.

> **수용한 Auth 설정 — "Require current password when updating"는 coordinated rollout 전까지 OFF로 둔다** (2026-07-09 확정). 현재 lockfile은 `@supabase/supabase-js 2.110.0`을 해석해 `current_password`를 지원하지만, 배포된 구형 화면은 이를 보내지 않는다. 따라서 현재 화면·Auth 설정을 함께 교체하고 통합 검증하기 전에는 이 토글을 켜지 않는다.

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

   > **백업 범위:** `backup.yml`의 기본 `supabase db dump`는 애플리케이션 DB 백업이며 managed `auth`/`storage` 스키마와 Storage 객체 자체를 완전한 복구 계약으로 보장하지 않습니다. Auth 사용자·설정은 별도 내보내기/재생성 절차가, Storage 객체는 위에서 정한 별도 보관 절차가 필요합니다. 실제 덤프에 우연히 포함된 객체를 장래 복구 보장으로 간주하지 않습니다.
   >
   > 예시(schema 먼저, data 나중):
   > ```powershell
   > $env:PGPASSWORD = '<DB_PASSWORD>'
   > psql "<DATABASE_URL>" --set ON_ERROR_STOP=1 --single-transaction -f backup/sqa-p1-workflow-<date>-schema.sql
   > psql "<DATABASE_URL>" --set ON_ERROR_STOP=1 --single-transaction -f backup/sqa-p1-workflow-<date>-data.sql
   > ```
   > **폴백(덤프에 `auth` 스키마가 없을 때만):** 과거·수동 덤프처럼 `auth.users`가 빠진 백업이라면 `profiles` 복원이 FK 위반으로 실패합니다. 이때만 Dashboard > Authentication > Users에서 동일 이메일 계정을 먼저 만든 뒤 `public.profiles` → 나머지 순으로 복원합니다.

3. `profiles`, `review_requests`, `products` 행 수를 운영과 대조합니다.
4. RLS smoke test를 실행합니다 (`tests/rls/setup.sql` 참고).
   - Supabase local: `supabase start` 후 `SUPABASE_URL=http://127.0.0.1:54321` 등 env 설정, `npm test -- tests/rls`
   - 원격 테스트 DB: 동일 env + `RLS_*` 테스트 계정 변수 설정
   - local/자동화 불가 시 [TEST_PLAN.md](./TEST_PLAN.md)의 RLS 수동 검증 시나리오로 대체
5. 리허설 날짜·담당·결과를 이 문서 하단 또는 팀 위키에 기록합니다.

### 운영 장애 시 신규 Supabase 프로젝트 전환 런북

운영 DB가 손상됐거나 기존 프로젝트를 신뢰할 수 없을 때는 기존 DB에 덮어쓰지 말고 신규 프로젝트로 전환합니다. 아래 작업은 장애 책임자와 검증 담당자 2인이 함께 수행합니다.

1. 장애 시각을 기록하고 기존 Worker 배포를 중단합니다. 손상된 운영 DB에는 추가 migration이나 복원 SQL을 실행하지 않습니다.
2. 서울 리전(`ap-northeast-2`)에 신규 Supabase 프로젝트를 생성하고 새 프로젝트의 DB URL·project URL·anon key를 비밀번호 관리자에 보관합니다.
3. 최신 백업 artifact를 내려받아 암구호로 복호화하고, 파일 크기와 schema의 `CREATE TABLE`, data의 `COPY`/`INSERT`를 확인합니다.
4. 신규 프로젝트에 schema → data 순서로 복원합니다. 오류가 하나라도 있으면 전환하지 말고 새 프로젝트를 다시 비운 뒤 원인을 해결합니다.
5. Auth 설정을 재적용합니다: email signup OFF, Site URL/Redirect URL, SMTP·메일 설정, 비밀번호 최소 길이와 현재 비밀번호 요구 정책을 운영 기준과 대조합니다.
6. GitHub Actions의 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`을 신규 프로젝트 값으로 교체합니다. 이전 값은 즉시 폐기하지 말고 제한된 비상 롤백 기록으로만 보관합니다.
7. 신규 DB의 `supabase_migrations.schema_migrations`와 로컬 migration 목록을 대조합니다. 복원된 객체를 확인하지 않고 `migration repair --status applied`를 사용하지 않습니다.
8. RLS smoke test와 핵심 행 수(`profiles`, `products`, `review_requests`, 각 assignment)를 확인하고, leader/member 로그인·권한·첨부 없는 검토요청 작성까지 검증합니다.
9. Deploy Worker를 수동 실행합니다. 배포 workflow의 DB readiness 및 Worker health check가 모두 green일 때만 사용자에게 전환 완료를 공지합니다.
10. 이전 프로젝트는 즉시 삭제하지 않습니다. 접근을 제한하고 사고 분석·데이터 대조가 끝날 때까지 보존한 뒤 별도 승인으로 폐기합니다.

전환 기록에는 장애 원인, 사용한 백업 run ID, 복원 행 수, 변경한 GitHub 설정, RLS/로그인/배포 검증 결과, 최종 승인자를 남깁니다. Storage `review-attachments`는 백업 대상이 아니므로 복원되지 않는다는 점도 공지합니다.

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
| 1 | 대상이 leader이면 leader 권한·진행 중 업무를 다른 사람에게 이관 | 참조 이력 정리 |
| 2 | 앱에서 프로필을 비활성화 | 감사·검토·변경 이력은 보존되고 로그인 후 앱 접근은 차단됨 |
| 3 | `allowed_users`에서도 제거 | 앱 > 마스터 > 초대 관리 |
| 4 | 대상 계정으로 로그인 시도 | 접근 불가 확인 |

프로필과 Auth 사용자의 물리 삭제는 기본 운영 경로가 아니며 DB 트리거가 차단한다. 법적 삭제 요청은 별도 승인, 참조 이력 익명화 설계, 백업 영향 검토를 거친 break-glass 절차로 처리한다.

## 임시 비밀번호·첫 로그인

공통 임시 비밀번호를 사용하지 않습니다. 계정마다 **서로 다른 16자 이상의 무작위 임시 비밀번호**를 생성하고 최초 로그인 직후 변경합니다.

1. 파트장이 `allowed_users`에 이메일·이름·역할을 등록합니다.
2. 비밀번호 관리자에서 계정별 16자 이상의 무작위 임시 비밀번호를 생성한 뒤 Supabase Dashboard > Authentication > Users > **Add user** 로 계정을 만듭니다(앱 가입 UI 없음). 임시 비밀번호를 문서·메신저 단체방·이메일 본문에 기록하지 않습니다.
   - Authentication → Providers → Email의 **Minimum password length는 8 이상을 유지하며 임시로 낮추지 않습니다.**
3. 임시 비밀번호는 본인에게 승인된 1:1 보안 채널로 한 번만 전달합니다. 사용자는 즉시 로그인해 `must_change_password` 화면에서 **8자 이상**의 새 비밀번호로 변경합니다.
4. 온보딩이 끝날 때까지 담당자가 함께 확인하고, 전달 실패·지연 시 기존 임시 비밀번호를 폐기하고 새 무작위 값으로 재설정합니다.

### 최초 변경 전 데이터 접근 차단

`must_change_password=true`인 동안에는 **RLS 레벨에서 데이터 읽기/쓰기가 차단**됩니다. 완료 플래그는 `auth.users.encrypted_password` 변경을 관찰하는 DB 트리거만 해제하며, 앱은 Auth 비밀번호 변경 후 프로필 상태를 다시 조회합니다. 최종 스키마에는 legacy `mark_password_changed()`의 어떤 overload도 남지 않으며, 구형 review mutation signature도 제거됩니다.

### 운영 완화책

- **온보딩은 한 명씩** — 계정 생성 직후 본인이 로그인해 비밀번호를 변경하게 하고, 미사용 임시 계정을 방치하지 않습니다.
- **public sign-up OFF는 필수 전제** — Supabase Dashboard에서 Enable email signup을 반드시 OFF로 둡니다(위 Auth 절 참고).

## 알려진 한계 (수용한 위험)

- **활동 로그 자기 명의 삽입**: member가 `activity_logs`에 자기 명의(`actor_id=self`)의 임의 로그를 삽입할 수 있다. 타인 사칭·수정·삭제는 불가(append-only)해 위험이 낮고, 차단하려면 모든 뮤테이션의 로그 삽입을 SECURITY DEFINER RPC로 옮기는 큰 변경이 필요해 수용한다. 감사 요구가 생기면 그때 RPC 경유로 좁힌다.

## 개인정보 처리 (팀 공지 필요)

이 앱은 팀원의 **이름·이메일**을 Supabase(외부 클라우드)에 저장합니다. Supabase 프로젝트는 **서울 리전(`ap-northeast-2`)** 에 생성합니다.

> **사용 시작 전 팀 공지 1회가 필요합니다.** 팀원 이름·이메일이 외부 클라우드(Supabase, 서울 리전)에 저장된다는 사실을 사용 시작 전에 팀에 1회 공지하고, 공지 일자를 이 문서 하단 또는 팀 위키에 기록합니다.

> **저장소 public 전환 금지.** 현재 HEAD는 실값을 제거했지만, **git 이력에는 과거 커밋의 팀원 실명·사내 이메일·운영 프로필 UUID·운영 URL이 남아 있습니다.** 이력 재작성(`git filter-repo` 등)과 노출 값 전수 점검 없이는 이 저장소를 절대 public으로 전환하지 않습니다. fork·이관·외부 공유도 동일하게 취급합니다.

## 배포

자세한 CI/CD 설정은 [DEPLOYMENT.md](./DEPLOYMENT.md)를 참고하세요.  
**직접 수행 작업 전체 계획**은 [MANUAL_TASKS_PLAN.md](./MANUAL_TASKS_PLAN.md)를 참고하세요.

새 운영 마이그레이션의 정규 경로는 보호된 **Actions → DB Migrate**(workflow_dispatch)입니다. 로컬 `npx supabase db push`는 Actions를 사용할 수 없는 장애 대응용 break-glass 경로이며, 동일한 백업·대상 프로젝트 확인·검증 증거와 승인 기록 없이는 사용하지 않습니다. 절차와 확인 SQL은 [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md) 참고.

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
