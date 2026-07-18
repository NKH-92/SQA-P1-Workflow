# 배포 및 운영 체크리스트

## GitHub 저장소

원격 저장소는 GitHub `origin/main`이며, `main` push가 CI·배포 워크플로의 트리거다.

- `.env.local`, `node_modules`, `dist`, 백업·시드 로컬 파일은 `.gitignore`로 커밋에서 제외된다.
- 운영 URL·Supabase project ref·키는 저장소에 커밋하지 않는다 (GitHub Variables/Secrets로만 관리).

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
5. 이후 초대 사용자는 `allowed_users` 등록 후 Dashboard에서 사용자를 생성한다 (앱 가입 UI 없음).
6. 여러 사용자를 한 번에 넣어야 하면 `supabase/private_seed.example.sql`을 `supabase/private_seed.local.sql`로 복사한 뒤 실제 이메일/이름으로 바꿔 SQL Editor에서 실행한다. `.local.sql` 파일은 커밋하지 않는다.

### 사용자 제거 (퇴사·전배자)

**기본은 삭제가 아니라 비활성화(`is_active=false`)다.** 초대 목록에서만 삭제해도 이미 가입한 계정의 로그인은 막히지 않는다. 삭제는 보존 기간(권장 1년) 경과 후에만 검토한다 — cascade로 지워지는 업무 이력과 leader 계정 삭제 실패(FK RESTRICT) 케이스가 있으므로 반드시 [OPERATIONS.md](./OPERATIONS.md) "사용자 제거 (퇴사·전배자 처리)" 절차를 따른다.

## Cloudflare Workers (기본 배포)

이 저장소는 GitHub Actions로 **Cloudflare Workers**(`wrangler deploy --assets`)에 정적 SPA를 배포한다.

- **CI** (`.github/workflows/ci.yml`): push/PR 시 `typecheck`, `lint`, `test`, `build` 4 job
- **Deploy Worker** (`.github/workflows/deploy-worker.yml`): `workflow_dispatch`에서 `main`을 선택하고 `deploy_confirm=true`를 명시한 경우에만 branch guard → RLS → `typecheck` → `lint` → `test` → deploy config check → 운영 DB migration/RPC readiness check → `build` → deploy를 수행한다. `main` push는 CI만 실행하며 자동 운영 배포를 시작하지 않는다.
- 배포 전에는 Supabase URL/anon key와 Auth 설정(signup OFF, email confirmation ON, anonymous OFF)을 실제 endpoint로 확인한다. 배포 후에는 `WORKER_URL`의 root mount·CSP·nosniff를 확인한다. **배포 후 healthcheck가 red면 이미 새 Worker가 올라간 상태**이므로 아래 롤백 절차로 즉시 이전 정상 버전을 재배포하고 원인을 조사한다.
- 현재 healthcheck는 로그인 전 정적 HTML이 인증 없이 읽힌다는 전제다. Cloudflare Access를 활성화할 때는 Access service token을 healthcheck에 먼저 추가한 뒤 정책을 켠다. 그렇지 않으면 정상적인 `403`도 배포 실패로 판정한다.
- 프런트가 신규 DB RPC를 사용하기 시작하는 변경은 한 번에 병합하지 않는다. migration-only 반영 → 직전 백업 → DB Migrate postcondition/RLS 확인 → 프런트 반영 순서로 분리한다.

### GitHub Variables / Secrets

Repository Settings > Secrets and variables > Actions에 다음을 등록한다.

| 종류 | 이름 | 설명 |
|---|---|---|
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 계정 ID |
| Variable | `WORKER_NAME` | Worker 이름 (예: `sqa-p1-workflow`) |
| Variable | `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| Secret | `VITE_SUPABASE_ANON_KEY` | Supabase anon(publishable) key |
| Secret | `CLOUDFLARE_API_TOKEN` | Workers 배포 권한이 있는 API 토큰 |

빌드 시 `VITE_APP_MODE=production`이 GitHub Actions Build 단계에 주입된다. Supabase env 없이 production 빌드가 배포되면 앱은 로그인 우회 없이 **설정 오류 화면**만 표시한다. 로컬 데모 미리보기는 `VITE_APP_MODE=preview`와 빈 Supabase env로 실행한다.

### 배포 성공 vs 스킵 구분

| 트리거 | Variables/Secrets 미설정 시 | green check 의미 |
|---|---|---|
| `push` → `main` | 수동 배포 정책 위반으로 실패 | 운영 배포 없음 |
| `workflow_dispatch` + `deploy_confirm=false` | 확인 단계에서 실패 | 운영 배포 없음 |
| `workflow_dispatch` + `main` + `deploy_confirm=true` | 설정 누락 시 즉시 실패 | 모든 게이트 통과 시에만 실제 배포 |

**주의:** 운영 배포는 자동화하지 않는다. Actions에서 **Deploy Worker**를 `workflow_dispatch`로 실행하고 Branch는 반드시 `main`, `deploy_confirm=true`를 선택해야 한다. 설정 누락, 비-main ref, 확인값 미입력은 모두 즉시 실패한다. 설정 누락을 성공한 테스트 실행으로 처리하는 경로는 없다.

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
- `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`
- 외부 폰트 CDN은 사용하지 않습니다 (Inter·Newsreader·JetBrains Mono를 `@fontsource-variable`로 번들에 셀프 호스팅)

배포 후 브라우저 DevTools Console에서 CSP violation이 없는지, 로그인과 첨부 없는 검토요청 생성·조회가 동작하는지 확인하세요.

### 롤백

GitHub Actions에서 이전 성공 워크플로 run을 **Re-run**하거나, 문제 커밋을 revert한 뒤 main에 push한다.

주의사항:

- Re-run은 GitHub 정책상 **run 생성 후 30일까지만** 가능하다. 그보다 오래된 시점으로는 revert + push 경로를 쓴다.
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
- 운영 URL·Supabase project ref는 저장소에 커밋하지 않는다. `WORKER_URL`은 배포 후 자동 헬스체크용 GitHub Actions Variable로 등록하고, 실제 값은 GitHub Variables/Secrets와 [MANUAL_TASKS_PLAN.md](./MANUAL_TASKS_PLAN.md) 체크리스트 하단에 `<WORKER_URL>`, `<PROJECT_REF>` 플레이스홀더로 기록한다.
- 백업·복구·장애 대응은 [OPERATIONS.md](./OPERATIONS.md)를 참고한다.
- Supabase Pro 전환 기준:
  - 실제 업무에서 매일 사용하기 시작함
  - DB가 350-400MB에 접근함
  - 백업, 복구, 운영 안정성, 다중 관리자 운영이 필요함

## 운영자 직접 수행 계획

배포·마이그레이션·RLS·백업 등 **사람이 직접 해야 하는 작업**의 순서와 체크리스트는 [MANUAL_TASKS_PLAN.md](./MANUAL_TASKS_PLAN.md)를 참고한다.
