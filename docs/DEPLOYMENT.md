# 배포 및 운영 체크리스트

## GitHub 저장소

원격 저장소는 GitHub `origin/main`이며, `main` push가 CI·배포 워크플로의 트리거다.

- `.env.local`, `node_modules`, `dist`, 백업·시드 로컬 파일은 `.gitignore`로 커밋에서 제외된다.
- 운영 URL·Supabase project ref·키는 저장소에 커밋하지 않는다 (GitHub Variables/Secrets로만 관리).

## Supabase

1. 새 Supabase 프로젝트를 만든다. **리전(Region)은 반드시 `Northeast Asia (Seoul) / ap-northeast-2`** 로 선택한다. (팀원 이름·이메일이 이 리전에 저장되며, 사용 시작 전 팀 공지가 필요하다 — [OPERATIONS.md](./OPERATIONS.md) 개인정보 처리 절 참고.)
2. `supabase/migrations` 아래 SQL 파일을 번호 순서대로 적용한다. 전체 목록·확인 SQL은 [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md)를 참고한다.
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
- **Deploy Worker** (`.github/workflows/deploy-worker.yml`): `main` push 또는 `workflow_dispatch` 시 `typecheck` → `lint` → `test` → deploy config check → `build` → deploy

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
| `push` → `main` | 워크플로 **실패** (exit 1). Job Summary에 누락 항목 표시 | 빌드·테스트는 통과했지만 **배포되지 않음** |
| `workflow_dispatch` | **테스트만** 수행, build/deploy **스킵** (warning). Job Summary에 스킵 사유 표시 | 수동 test-only 실행 성공. 배포·빌드는 아님 |
| 위 설정 모두 등록됨 | Wrangler deploy 실행 | Job Summary에 **Deploy succeeded** — 실제 배포 완료 |

**주의:** `main` push에서 deploy env가 없으면 워크플로가 **실패**한다 — 설정 누락을 조용히 넘기지 않기 위한 의도된 동작이다. CI 테스트만 확인하려면 Actions에서 **Deploy Worker** 워크플로를 `workflow_dispatch`로 실행한다 (env 미설정 시 test만 통과, build/deploy는 스킵).

### 수동 배포

**PowerShell (Windows)** — 파트장 PC 기준. 인라인 `VAR=x cmd` 문법은 PowerShell에서 동작하지 않으므로 `$env:VAR='x'`로 먼저 설정한다.

```powershell
npm ci
npm test
$env:VITE_APP_MODE = 'production'
$env:VITE_SUPABASE_URL = '<SUPABASE_URL>'
$env:VITE_SUPABASE_ANON_KEY = '<SUPABASE_ANON_KEY>'
npm run build
npx --yes wrangler@4 deploy --name <WORKER_NAME> --assets dist --keep-vars --compatibility-date 2026-07-04
```

**bash / macOS** — 인라인 env 문법 사용 가능.

```bash
npm ci
npm test
VITE_APP_MODE=production VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run build
npx --yes wrangler@4 deploy --name <WORKER_NAME> --assets dist --keep-vars --compatibility-date 2026-07-04
```

CI(`deploy-worker.yml`)와 동일한 wrangler 버전·`--compatibility-date`를 사용한다. 날짜를 올릴 때는 CI와 이 문서를 함께 바꾼다.

### 보안 헤더 (CSP)

`public/_headers`가 Vite 빌드 시 `dist/_headers`로 복사되어 Cloudflare Workers static assets에 적용됩니다.

- `Content-Security-Policy`: `connect-src`에 Supabase(`https://*.supabase.co`, `wss://*.supabase.co`)만 허용
- `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`
- 외부 폰트 CDN은 사용하지 않습니다 (Inter·Newsreader·JetBrains Mono를 `@fontsource-variable`로 번들에 셀프 호스팅)

배포 후 브라우저 DevTools Console에서 CSP violation이 없는지, 로그인·Storage signed URL이 동작하는지 확인하세요.

### 롤백

GitHub Actions에서 이전 성공 워크플로 run을 **Re-run**하거나, 문제 커밋을 revert한 뒤 main에 push한다.

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
- 운영 URL·Supabase project ref는 저장소에 커밋하지 않는다. GitHub Variables/Secrets와 [MANUAL_TASKS_PLAN.md](./MANUAL_TASKS_PLAN.md) 체크리스트 하단에 `<WORKER_URL>`, `<PROJECT_REF>` 플레이스홀더로 기록한다.
- 백업·복구·장애 대응은 [OPERATIONS.md](./OPERATIONS.md)를 참고한다.
- Supabase Pro 전환 기준:
  - 실제 업무에서 매일 사용하기 시작함
  - DB가 350-400MB에 접근함
  - 백업, 복구, 운영 안정성, 다중 관리자 운영이 필요함

## 운영자 직접 수행 계획

배포·마이그레이션·RLS·백업 등 **사람이 직접 해야 하는 작업**의 순서와 체크리스트는 [MANUAL_TASKS_PLAN.md](./MANUAL_TASKS_PLAN.md)를 참고한다.
