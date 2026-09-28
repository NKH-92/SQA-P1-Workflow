# 배포 및 운영 체크리스트

## GitHub 저장소

저장소는 **Private / 내부 운영용**으로 유지한다. Git 과거 이력에 팀원 개인정보와
운영 식별자가 있으므로 public 전환, 공개 fork, 외부 미러링을 금지한다.

기본 브랜치는 `main`이다. 저장소 설정은 squash merge만 허용하고 병합된 작업
브랜치를 자동 삭제한다. 현재 GitHub 요금제는 Private 저장소 ruleset을 지원하지
않으므로 `main` 직접 push·force push·삭제를 운영상 금지하고 PR의 전체 `build`
성공과 review thread 해결을 사람이 확인한다. GitHub Pro 이상으로 전환하면
PR·필수 check·linear history ruleset을 다시 활성화한다. `main` push는 CI만
실행하며 운영 DB와 Worker는 수동 승인을 거친 `workflow_dispatch`로만 변경한다.

- `.env.local`, `node_modules`, `dist`, 백업·시드 로컬 파일은 `.gitignore`로 커밋에서 제외된다.
- 운영 URL·Supabase project ref·계정 ID·키·사용자 실값은 저장소에 커밋하지 않는다
  (GitHub Variables/Secrets 또는 승인된 내부 운영 기록으로만 관리).

## Supabase

1. 새 Supabase 프로젝트를 만든다. **리전(Region)은 반드시 `Northeast Asia (Seoul) / ap-northeast-2`** 로 선택한다. (팀원 이름·이메일이 이 리전에 저장되며, 사용 시작 전 팀 공지가 필요하다 — [OPERATIONS.md](./OPERATIONS.md) 개인정보 처리 절 참고.)
2. `supabase/migrations` 아래 SQL 파일을 번호 순서대로 적용한다. 전체 목록·확인 SQL은 [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md)를 참고한다. 로컬 CLI 인증이 없으면 Actions → **DB Migrate**(workflow_dispatch)로 적용할 수 있다.
3. 첫 파트장 bootstrap은 SQL Editor에서 1회 수행한다.

```sql
insert into public.allowed_users (email, name, role)
values ('leader@example.com', '파트장 이름', 'leader')
on conflict (email) do update
set name = excluded.name,
    role = excluded.role;
```

4. Supabase Dashboard > Authentication > Users > **Add user** 로 첫 파트장 계정을 만든 뒤 앱에서 로그인한다. `auth.users` 생성 시 trigger가 `profiles`를 만든다.
5. 이후 사용자는 파트장이 앱의 **계정 관리**에서 생성한다. `account-admin` Edge Function이 `allowed_users`와 Auth 사용자를 함께 만들며 공개 가입 UI는 없다.
6. 여러 사용자를 한 번에 넣어야 하면 `supabase/private_seed.example.sql`을 `supabase/private_seed.local.sql`로 복사한 뒤 실제 이메일/이름으로 바꿔 SQL Editor에서 실행한다. `.local.sql` 파일은 커밋하지 않는다.

### 사용자 제거 (퇴사·전배자)

**기본은 삭제가 아니라 비활성화(`is_active=false`)다.** 계정 목록에서만 삭제해도 이미 가입한 계정의 로그인은 막히지 않는다. 삭제는 보존 기간(권장 1년) 경과 후에만 검토한다 — 프로필과 Auth 사용자의 물리 삭제는 DB 트리거(`profiles_block_physical_delete`)가 차단하며, 트리거를 끄면 업무 이력이 cascade로 영구 삭제되므로 반드시 [OPERATIONS.md](./OPERATIONS.md) "사용자 제거 (퇴사·전배자 처리)" 절차를 따른다.

## Cloudflare Workers (기본 배포)

이 저장소는 GitHub Actions로 **Cloudflare Workers**(`wrangler deploy --assets`)에 정적 SPA를 배포한다.

- **CI** (`.github/workflows/ci.yml`): push/PR 시 `typecheck`, `lint`, unit, RLS, preview E2E, remote E2E를 실행하고 모두 성공한 뒤 `build`한다.
- **DB Migrate** (`.github/workflows/db-migrate.yml`): `workflow_dispatch`에서 동일 `main` SHA의 성공한 CI `push` run ID와 24시간 이내 암호화 Backup DB run ID를 모두 검증한 뒤 migration과 canonical readiness를 실행한다.
- **Deploy Worker** (`.github/workflows/deploy-worker.yml`): `workflow_dispatch`에서 `main`, `deploy_confirm=true`, 동일 SHA의 성공한 `ci_run_id`와 `db_migrate_run_id`를 입력한 경우에만 CI/DB provenance guard → RLS → `typecheck` → `lint` → unit → deploy config check → 운영 DB readiness → `build` → deploy를 수행한다. DB Migrate run은 24시간 이내, `workflow_dispatch`, `main`, 동일 SHA, success여야 한다.
- 배포 전에는 Supabase URL/anon key와 Auth 설정(signup OFF, email confirmation ON, anonymous OFF)을 실제 endpoint로 확인한다. 배포 후에는 `WORKER_URL`의 root mount·CSP·nosniff를 확인한다. **배포 후 healthcheck가 red면 이미 새 Worker가 올라간 상태**이므로 아래 롤백 절차로 즉시 이전 정상 버전을 재배포하고 원인을 조사한다.
- 현재 healthcheck는 로그인 전 정적 HTML이 인증 없이 읽힌다는 전제다. Cloudflare Access를 활성화할 때는 Access service token을 healthcheck에 먼저 추가한 뒤 정책을 켠다. 그렇지 않으면 정상적인 `403`도 배포 실패로 판정한다.
- 신규 DB RPC를 쓰는 릴리스는 **expand/contract**로 나눈다. 먼저 구 Worker와 신 Worker가 모두 동작하는 additive migration을 같은 SHA로 준비해 `Backup DB → DB Migrate → Deploy Worker` 순서로 승격한다. 구 RPC·직접 쓰기 권한 회수는 신 Worker 안정화와 롤백 기준 갱신 뒤 별도 contract migration에서만 수행한다.
  - 운영 중인 Worker가 호출하는 RPC(특히 `get_core_bootstrap_v2`·`get_change_bootstrap_v3` 같은 필수 bootstrap)는 같은 이름으로 응답 `schema_version`·인자 시그니처·필수 필드를 바꾸거나 drop하지 않는다. 형태를 바꿀 때는 새 이름(`_vN+1`)을 추가하고 구 이름은 contract migration까지 유지한다(`get_change_bootstrap_v2` → `v3` 선례). 응답 형태(`schema_version`)를 바꾸면서 같은 이름을 다시 만든 과거 migration(예: `20260720161117`) 방식은 운영 중인 함수에 쓰지 않는다. 동작만 고치고 형태(시그니처·`schema_version`·필수 필드·권한)를 그대로 두는 같은 이름 재정의는 허용한다(예: `20260928090000`의 정렬 수정).
  - contract migration은 expand Deploy 직후 팀 메신저로 모든 탭 새로고침(F5)을 공지하고, **최소 1 영업일**(주말이 끼면 다음 월요일 오전 이후)이 지난 뒤에만 적용한다. contract 적용 직후 F5를 한 번 더 공지한다. 새로고침하지 않은 탭은 삭제된 RPC를 불러 오류가 난다.
- Backup DB, DB Migrate, Deploy Worker는 모두 `sqa-production-release` concurrency group을 사용하고 진행 중 실행을 취소하지 않는다. 서로 다른 운영 단계가 겹쳐 부분 승격되는 것을 막는다.

### GitHub Variables / Secrets

Repository Settings > Secrets and variables > Actions에 다음을 등록한다.

| 종류 | 이름 | 설명 |
|---|---|---|
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 계정 ID |
| Variable | `WORKER_NAME` | Worker 이름 (예: `sqa-p1-workflow`) |
| Variable | `WORKER_URL` | 배포 후 provenance·healthcheck 대상 URL |
| Variable | `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| Secret | `VITE_SUPABASE_ANON_KEY` | Supabase anon(publishable) key |
| Secret | `CLOUDFLARE_API_TOKEN` | Workers 배포 권한이 있는 API 토큰 |
| Secret | `SUPABASE_DB_URL` | Backup DB·DB Migrate·배포 readiness용 Session pooler URI |
| Secret | `SUPABASE_ACCESS_TOKEN` | DB Migrate 단계의 Edge Function 배포용 PAT. 발급 때 정한 **만료일을 승인된 내부 운영 기록에 남기고 만료 전에 교체**한다. DB Migrate는 DB에 접속하기 전에 이 토큰이 유효한지 먼저 확인하고, 무효하면 migration 없이 `SQA_SUPABASE_ACCESS_TOKEN_INVALID`로 중단한다 |
| Secret | `SUPABASE_PROJECT_REF` | Edge Function 배포 대상 project ref. `SUPABASE_DB_URL`과 **같은 프로젝트**를 가리켜야 하며, 다르면 DB Migrate가 `SQA_SUPABASE_DB_URL_PROJECT_REF_MISMATCH`로 중단한다 |
| Secret | `BACKUP_PASSPHRASE` | 암호화 백업용 암구호 |

빌드 시 `VITE_APP_MODE=production`이 GitHub Actions Build 단계에 주입된다. Supabase env 없이 production 빌드가 배포되면 앱은 로그인 우회 없이 **설정 오류 화면**만 표시한다. 로컬 데모 미리보기는 `VITE_APP_MODE=preview`와 빈 Supabase env로 실행한다.

### 배포 성공 vs 스킵 구분

| 트리거 | Variables/Secrets 미설정 시 | green check 의미 |
|---|---|---|
| `push` → `main` | CI 설정이 불완전하면 CI 실패 | CI만 실행하며 운영 배포 없음 |
| `workflow_dispatch` + `deploy_confirm=false` | 확인 단계에서 실패 | 운영 배포 없음 |
| `workflow_dispatch` + `main` + `deploy_confirm=true` + 유효한 `ci_run_id`·`db_migrate_run_id` | 설정·동일 SHA CI/DB 증거 누락 시 즉시 실패 | 모든 게이트 통과 시에만 실제 배포 |

**주의:** 운영 배포는 자동화하지 않는다. Actions에서 **Deploy Worker**를 `workflow_dispatch`로 실행하고 Branch는 반드시 `main`, `deploy_confirm=true`, 방금 성공한 동일 SHA의 CI run ID와 DB Migrate run ID를 입력해야 한다. 설정 누락, 비-main ref, 확인값·CI/DB 증거 누락은 모두 즉시 실패한다. 설정 누락을 성공한 테스트 실행으로 처리하는 경로는 없다.

### 수동 배포 (break-glass 전용)

아래 명령은 보호된 GitHub Environment, 승인자, 배포 전 DB readiness gate를 우회할 수 있으므로 정규 배포에 사용하지 않는다. Actions 자체가 장시간 사용할 수 없는 장애 상황에서만 승인자·대상 Worker·백업·검증 결과를 기록하고 실행한다.

**PowerShell (Windows)** — 파트장 PC 기준. 인라인 `VAR=x cmd` 문법은 PowerShell에서 동작하지 않으므로 `$env:VAR='x'`로 먼저 설정한다.

```powershell
npm ci
npm test
$env:VITE_APP_MODE = 'production'
$env:VITE_SUPABASE_URL = '<SUPABASE_URL>'
$env:VITE_SUPABASE_ANON_KEY = '<SUPABASE_ANON_KEY>'
npm run build
npm ci
npx --no-install wrangler deploy --name <WORKER_NAME> --assets dist --keep-vars --compatibility-date 2026-07-04
```

**bash / macOS** — 인라인 env 문법 사용 가능.

```bash
npm ci
npm test
VITE_APP_MODE=production VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run build
npm ci
npx --no-install wrangler deploy --name <WORKER_NAME> --assets dist --keep-vars --compatibility-date 2026-07-04
```

CI(`deploy-worker.yml`)와 동일한 wrangler 버전·`--compatibility-date`를 사용한다. 날짜를 올릴 때는 CI와 이 문서를 함께 바꾼다.

### 보안 헤더 (CSP)

`public/_headers`가 Vite 빌드 시 `dist/_headers`로 복사되어 Cloudflare Workers static assets에 적용됩니다.

- `Content-Security-Policy`: `connect-src`에 Supabase(`https://*.supabase.co`, `wss://*.supabase.co`)만 허용하고, 첨부 미리보기 제거에 맞춰 `img-src`의 `blob:` 권한은 허용하지 않음
- `worker-src 'self' blob:`는 **지우지 않는다.** `.xlsx` 가져오기에 쓰는 `read-excel-file`(fflate)이 큰 시트(압축 해제 512KB 이상)를 `blob:` Web Worker로 풀기 때문에 필요하다. 없으면 큰 Excel 파일 가져오기가 '파일 손상' 오류나 끝나지 않는 '읽는 중…'으로 실패한다
- `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`
- 외부 폰트 CDN은 사용하지 않습니다 (Inter·JetBrains Mono를 `@fontsource-variable`로 번들에 셀프 호스팅하며, 한글은 시스템 글꼴로 대체)

배포 후 브라우저 DevTools Console에서 CSP violation이 없는지, 로그인과 첨부 없는 검토요청 생성·조회가 동작하는지 확인하세요. CSP를 바꾼 릴리스에서는 큰 시트가 있는 `.xlsx`(예: 2,000행×8열 시트가 추가로 들어 있는 통합문서)를 공통변경 등록 창에서 한 번 가져와 봅니다. 헤더를 바꾼 릴리스에서는 `curl -I <WORKER_URL>/assets/<초기 JS 파일>`을 한 번 실행해 `Cache-Control: public, max-age=31536000, immutable`이 붙는지 확인합니다.

### 롤백

**긴급 프런트 롤백(1순위):** Cloudflare Dashboard > Workers & Pages > 해당 Worker > **Deployments**에서 직전 정상 버전을 **Rollback**한다. 로컬에서는 `npx --no-install wrangler rollback`(대상 Worker 이름 확인)으로도 할 수 있다.

- **DB가 구 Worker와 호환될 때만** 사용한다. expand 단계(additive migration)만 적용된 릴리스는 가능하고, contract migration(구 RPC 삭제·권한 회수)을 적용한 뒤에는 그 이전 Worker로 롤백하지 않는다.
- 롤백 뒤 `<WORKER_URL>/version.json`의 `sha`가 되돌린 정상 SHA인지 확인하고, 시각·사유·SHA를 승인된 내부 운영 기록에 남긴다. 팀 메신저로 모든 탭 새로고침(F5)을 공지한다.
- 이 경로는 GitHub Actions의 provenance·readiness gate를 거치지 않는 임시 조치다. 이어서 아래 roll-forward로 `main`과 운영을 다시 맞춘다.

**Actions 경로:**

- **Deploy Worker Re-run**은 롤백 대상 SHA 이후 **새 migration이 운영에 적용되지 않았을 때만** 유효하다. Re-run은 원래 SHA의 `scripts/sql/verify/00_migration_history.sql`로 운영 migration 이력을 exact-set 비교하므로, 그 뒤 migration이 하나라도 적용됐으면 `SQA_DB_READY_MIGRATION_SET`으로 실패한다. 또 입력에 기록된 동일 SHA의 DB Migrate run이 **24시간 이내**일 때만 provenance guard를 통과하며, GitHub가 이전 run의 Re-run 버튼을 제공하더라도 이 제한을 우회하지 못한다.
- 그 밖의 롤백은 **프런트 변경(`src/`·`public/` 등)만 되돌리는 커밋**이나 호환되는 수정 커밋을 `main`에 반영한 뒤, 새 동일 SHA에서 `CI → Backup DB → DB Migrate → Deploy Worker`를 다시 수행한다. `supabase/migrations`·`scripts/sql/verify`·readiness manifest는 **절대 되돌리지 않는다**(`git revert`로 migration 파일이 빠지면 DB Migrate가 운영 이력과 맞지 않아 실패한다). 오래된 CI·DB Migrate run ID를 재사용하지 않는다.
- 이 롤백은 **Worker(프런트엔드)만** 되돌린다. DB 마이그레이션은 롤백 스크립트가 없으므로(append-only), DB 문제는 [OPERATIONS.md](./OPERATIONS.md)의 백업 복원 절차를 따른다.

### SPA 라우팅

현재는 URL 해시(`#/reviews` 등) 기반이므로 Workers 추가 설정이 필요 없다. 추후 path 기반 라우터를 도입하면 `--assets` SPA fallback 설정이 필요하다.

`service_role` key는 Workers 빌드 env와 브라우저 번들에 **절대** 등록하지 않는다.

## Cloudflare Pages (대안)

Workers 대신 Pages를 쓰려면:

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Pages URL을 Supabase Auth의 Site URL 및 Redirect URLs에 추가한다.

## 운영 전 보호

- 앱 내부 권한은 Supabase Auth와 RLS가 담당한다. public sign-up은 **비활성화 상태를 유지**하고(적용 완료 — [OPERATIONS.md](./OPERATIONS.md) Auth 절), 계정은 Dashboard에서만 생성한다.
- 운영 URL·Supabase project ref는 저장소에 커밋하지 않는다. `WORKER_URL`은 배포 후
  자동 헬스체크용 GitHub Actions Variable로 등록하고, 릴리스 증거에는
  [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)의 플레이스홀더만 사용한다. 실제 값은
  승인된 내부 운영 기록에 남긴다.
- 백업·복구·장애 대응은 [OPERATIONS.md](./OPERATIONS.md)를 참고한다.
- Supabase Pro 전환 기준:
  - 실제 업무에서 매일 사용하기 시작함
  - DB가 350-400MB에 접근함
  - [OPERATIONS.md](./OPERATIONS.md) "월 1회 사용량 점검"에서 DB 크기·Egress·Realtime 중 하나가 무료 한도의 70%에 도달함
  - 백업, 복구, 운영 안정성, 다중 관리자 운영이 필요함

## 운영자 직접 수행 계획

배포·마이그레이션·RLS·백업 등 **사람이 직접 확인해야 하는 반복 작업**의 순서와
증거는 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)를 참고한다. 최초 구축 당시
계획은 [archive/INITIAL_DEPLOYMENT_PLAN.md](./archive/INITIAL_DEPLOYMENT_PLAN.md)에
이력으로 보관한다.
