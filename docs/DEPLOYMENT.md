# 배포 및 운영 체크리스트

## GitHub 업로드

1. 로컬 저장소를 초기화한다.

```bash
git init
git add .
git commit -m "Initial SQA P1 Workflow app"
```

2. GitHub에서 새 저장소를 만든다. 운영 전까지는 private 저장소를 권장한다.
3. GitHub가 안내하는 remote URL을 연결하고 push한다.

```bash
git branch -M main
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

업로드 전에 `.env.local`, `node_modules`, `dist`는 커밋 대상에서 제외되어야 한다. 이 프로젝트는 `.gitignore`에서 해당 항목을 제외한다.

## Supabase

1. 새 Supabase 프로젝트를 만든다.
2. `supabase/migrations` 아래 SQL 파일을 번호 순서대로 적용한다. Phase 2~4 추가분은 [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md)를 참고한다.
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

### 사용자 제거

초대 목록에서만 삭제하면 이미 가입한 계정은 계속 로그인할 수 있다. Supabase Dashboard > Authentication > Users에서 사용자를 삭제하면 `profiles`가 cascade로 함께 삭제된다. 자세한 절차는 [OPERATIONS.md](./OPERATIONS.md)를 참고한다.

## Cloudflare Workers (기본 배포)

이 저장소는 GitHub Actions로 **Cloudflare Workers**(`wrangler deploy --assets`)에 정적 SPA를 배포한다.

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

**주의:** `main` push 후 Actions가 green이어도, 예전에는 deploy env가 없을 때 배포 없이 성공처럼 보일 수 있었다. 현재는 `main` push에서 deploy env가 없으면 워크플로가 **실패**한다. CI 테스트만 확인하려면 Actions에서 **Deploy Worker** 워크플로를 `workflow_dispatch`로 실행한다 (env 미설정 시 test만 통과, build/deploy는 스킵).

### 수동 배포

```bash
npm ci
npm test
VITE_APP_MODE=production VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run build
npx wrangler deploy --name <WORKER_NAME> --assets dist --keep-vars
```

### 보안 헤더 (CSP)

`public/_headers`가 Vite 빌드 시 `dist/_headers`로 복사되어 Cloudflare Workers static assets에 적용됩니다.

- `Content-Security-Policy`: `connect-src`에 Supabase(`https://*.supabase.co`, `wss://*.supabase.co`)만 허용
- `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`
- Google Fonts CDN은 사용하지 않습니다 (시스템 폰트 스택)

배포 후 브라우저 DevTools Console에서 CSP violation이 없는지, 로그인·Storage signed URL이 동작하는지 확인하세요. Cloudflare Access는 URL 앞단 접근 제어용이며 CSP와 별개입니다.

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

- **내부 전용 배포에서는 Cloudflare Access가 필수**이다. Worker(또는 Pages) 도메인 앞단에 Access policy를 적용해 팀 이메일 도메인만 허용한다.
- Access는 URL 접근 보호이고, 앱 내부 권한은 Supabase RLS가 계속 담당한다.
- 운영 URL·Supabase project ref는 저장소에 커밋하지 않는다. GitHub Variables/Secrets와 [MANUAL_TASKS_PLAN.md](./MANUAL_TASKS_PLAN.md) 체크리스트 하단에 `<WORKER_URL>`, `<PROJECT_REF>` 플레이스홀더로 기록한다.
- 백업·복구·장애 대응은 [OPERATIONS.md](./OPERATIONS.md)를 참고한다.
- Supabase Pro 전환 기준:
  - 실제 업무에서 매일 사용하기 시작함
  - DB가 350-400MB에 접근함
  - 백업, 복구, 운영 안정성, 다중 관리자 운영이 필요함

## 운영자 직접 수행 계획

배포·마이그레이션·RLS·백업 등 **사람이 직접 해야 하는 작업**의 순서와 체크리스트는 [MANUAL_TASKS_PLAN.md](./MANUAL_TASKS_PLAN.md)를 참고한다.
